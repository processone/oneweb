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
            (function (delta, callback) {
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

                if (callback) {
                    var error = pkt.getChild(null, "urn:ietf:params:xml:ns:xmpp-stanzas");
                    var type = pkt.getType() == "result" ? null : error ? error.nodeName : "unknown";
                    callback(type);
                }

                yield null;
            }).apply(this, arguments));
    },

    deleteNode: function(callback) {
        servicesManager.sendIqWithGenerator(
            (function (callback) {
                var fields = [];

                [pkt, query, queryDOM] = yield {
                    type: "set",
                    domBuilder: ["pubsub", {xmlns: "http://jabber.org/protocol/pubsub#owner"},
                                 [["delete", {node: this._node},[]]]]
                };

                if (callback) {
                    var error = pkt.getChild(null, "urn:ietf:params:xml:ns:xmpp-stanzas");
                    var type = pkt.getType() == "result" ? null : error ? error.nodeName : "unknown";
                    callback(type);
                }

                yield null;
            }).apply(this, arguments));
    },

    destroy: function() {
        if (!this._callback)
            return;

        servicesManager.unpublishDiscoInfo(this._node+"+notify");
        delete pepService._observers[this._node];
    },

    createNode: function(callback, configuration) {
        servicesManager.sendIqWithGenerator(
            (function (callback, configuration) {
                var fields = [];

                if (configuration) {
                    configuration["FORM_TYPE"] = "http://jabber.org/protocol/pubsub#node_config";
                    for (var v in configuration)
                        fields.push(["field", {"var": v}, [["value", {}, [configuration[v]]]]]);
                }

                var create = [["create", {node: this._node}, []]];
                if (fields.length > 1)
                    create.push(["x", {xmlns: "jabber:x:data", type: "submit"}, fields]);

                var [pkt, query, queryDOM] = yield {
                    type: "set",
                    domBuilder: ["pubsub", {xmlns: "http://jabber.org/protocol/pubsub#owner"},
                                 create]
                };

                if (callback) {
                    var error = pkt.getChild(null, "urn:ietf:params:xml:ns:xmpp-stanzas");
                    var type = pkt.getType() == "result" ? null : error ? error.nodeName : "unknown";
                    callback(type);
                }

                yield null;
            }).apply(this, arguments));
        return null;
    },

    publishItem: function(id, data, dontSend, callback) {
        var pkt = new JSJaCIQ();
        var ns = "http://jabber.org/protocol/pubsub"

        pkt.setType("set");

        pkt.appendNode("pubsub", {xmlns: ns},
                       [["publish", {node: this._node},
                         [["item", id ? {id: id} : {}, data]]]]);

        if (!dontSend)
            account.connection.send(pkt, callback);

        return pkt;
    },

    retractItem: function(id, dontSend, callback) {
        var pkt = new JSJaCIQ();
        var ns = "http://jabber.org/protocol/pubsub"

        pkt.setType("set");

        pkt.appendNode("pubsub", {xmlns: ns},
                       [["retract", {node: this._node},
                         [["item", {id: id}, []]]]]);

        if (!dontSend)
            account.connection.send(pkt, callback);

        return pkt;
    },

    getItems: function(to, callback, maxItems) {
        servicesManager.sendIqWithGenerator(
            (function (to, callback, maxItems) {
                [pkt, query, queryDOM] = yield {
                    type: "get",
                    to: to,
                    domBuilder: ["pubsub", {xmlns: "http://jabber.org/protocol/pubsub"},
                                 [["items", maxItems ? {node: this._node, max_items: maxItems} :
                                                       {node: this._node}]]]
                };

                var res = [], error;
                if (pkt.getType() == "result") {
                    var ns = new Namespace("http://jabber.org/protocol/pubsub");
                    dump ("GOT getItems: "+query+"\n");

                    for each (var item in query.ns::items.ns::item)
                        res.push(item);
                } else {
                    error = pkt.getChild(null, "urn:ietf:params:xml:ns:xmpp-stanzas");
                    error = error ? error.nodeName : "unknown";
                }

                if (callback)
                    callback(to, res, error);

                yield null;
            }).apply(this, arguments));
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

        this._observers[items.@node]._callback.call(null, jid, items.@node.toString(), data, pkt);
    }
};

servicesManager.addMessageService("http://jabber.org/protocol/pubsub#event",
                                  new Callback(pepService._onEvent, pepService));
