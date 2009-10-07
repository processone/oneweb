var EXPORTED_SYMBOLS = ["pepService"];

function PEPNodeHandler(node, callback) {
    this._node = node;
    this._callback = callback;

    if (callback)
        servicesManager.publishDiscoInfo(node+"+notify");
}
_DECL_(PEPNodeHandler).prototype = {
    /**
     * Sends update node configuration packet
     *
     * @param delta Object - Hash with attribute name as property, and new
     *   value as hash value
     */

    getConfiguration: function(callback, force) {
        if (this._configuration && !force) {
            if (callback)
                callback(this._configuration);
            return this._configuration;
        }

        servicesManager.sendIqWithGenerator(
            (function (callback) {
                [pkt, query, queryDOM] = yield {
                    type: "get",
                    domBuilder: ["pubsub", {xmlns: "http://jabber.org/protocol/pubsub#owner"},
                                 [["configure", {node: this._node}]]]
                };

                if (pkt.getType() == "result") {
                    var ns1 = new Namespace("http://jabber.org/protocol/pubsub#owner");
                    var ns2 = new Namespace("jabber:x:data");

                    this._configuration = {};

                    for each (var field in query.ns1::configure.ns2::x.ns2::field)
                        this._configuration[filed.@var] = field.ns2::value.text().toString();
                } else
                    this._configuration = null;

                if (callback)
                    callback(this._configuration);

                yield null;
            }).call(this, callback));

        return this._configuration;
    },

    reconfigureNode: function(delta, callback) {
        servicesManager.sendIqWithGenerator(
            (function (delta) {
                var fields = [];

                delta["FORM_TYPE"] = "http://jabber.org/protocol/pubsub#node_config";
                for (var v in delta)
                    fields.push(["field", {"var": v}, [["value", {}, [delta[v]]]]]);

                [pkt, query, queryDOM] = yield {
                    type: "set",
                    domBuilder: ["pubsub", {xmlns: "http://jabber.org/protocol/pubsub#owner"},
                                 [["configure", {node: this._node},
                                   [["x", {xmlns: "jabber:x:data", type: "submit"}, fields]]]]]
                };

                if (callback)
                    callback(pkt.getType() == "result");

                yield null;
            }).call(this, delta));
    },

    publishItem: function(id, data) {
        var pkt = new JSJaCIQ();
        var ns = "http://jabber.org/protocol/pubsub"

        pkt.setType('set');

        pkt.appendNode("pubsub", {xmlns: ns},
                       [["publish", {node: this._node},
                         [["item", id ? {id: id} : {}, data]]]]);

        account.connection.send(pkt);
    },

    retractItem: function(id) {
        var pkt = new JSJaCIQ();
        var ns = "http://jabber.org/protocol/pubsub"

        pkt.setType('set');

        pkt.appendNode("pubsub", {xmlns: ns},
                       [["retract", {node: this._node},
                         [["item", {id: id}, []]]]]);

        account.connection.send(pkt);
    }
}

var pepService = {
    _observers: {},

    handlePEPNode: function(node, callback) {
        var handler = new PEPNodeHandler(node, callback)
        if (callback)
            this._observers[node] = handler;
        return handler;
    },

    _onEvent: function(pkt, event, jid, eventE4X) {
        if (event.nodeName != "event")
            return;

        var pepNS = new Namespace("http://jabber.org/protocol/pubsub#event");
        var items = eventE4X.pepNS::items;

        if (!this._observers[items.@node])
            return;

        var data = {added: [], removed: []};

        for each (var item in items.pepNS::item)
            data.added.push(item)
        for each (var item in items.pepNS::retract)
            data.removed.push(item.@id.toString())

        this._observers[items.@node]._callback.call(null, jid, items.@node.toString(), data);
    }
};

servicesManager.addMessageService("http://jabber.org/protocol/pubsub#event",
                                  new Callback(pepService._onEvent, pepService));
