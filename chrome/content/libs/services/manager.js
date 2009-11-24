/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is OneWeb.
 *
 * The Initial Developer of the Original Code is
 * ProcessOne.
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

var EXPORTED_SYMBOLS = ["servicesManager"];

function ServicesManager()
{
    this._iqHandlers = {};
    this._messageHandlers = {}
    this._nodes = {};
    this._identities = {};
    this._items = {};

    this._clean();
}

_DECL_(ServicesManager).prototype =
{
    _capsPrefix: "http://oneweb.im/caps",

    /**
     * Register new handler for iq stanzas from given namespace.
     *
     * Each handler will be called with two arguments, JSJaC request packet
     * and IQ query node converted to E4X.
     *
     * Handler can return E4X or DOM value which will be inserted into
     * generated reply IQ stanza (stanza with <code>type</code> <em>result</em>,
     * <code>id</code> copied from request stanza) and sent back. Alternatively
     * hander can return hash with fields to (jid of recipient), type
     * (IQ stanza type), dom and e4x (which will be inserted into reply IQ
     * stanza). Any field can be omitted. Handler can also return
     * <em>null</em> which indicates that no stanza should be sent, or
     * <em>0</em> for which bad-request error will be sent.
     *
     * @tparam String ns   Namespace of IQ stanzas which registered handled
     *  should handle.
     * @tparam Function handler   Function or Generator which should handle
     *  requests.
     * @tparam bool dontShowInDisco   If <em>true</em> namespace
     *  <code>ns</code> will not be visible in disco or entity caps responses.
     *
     *  @public
     */
    addIQService: function(ns, handler, dontShowInDisco)
    {
        this._iqHandlers[ns] = handler;
        if (!dontShowInDisco)
            this.publishDiscoInfo(ns);
    },

    /**
     * Register new handler for extension in message stanzas.
     *
     * Each handler will be called with three arguments, JSJaC request packet,
     * extension DOM node, requestor jid, and extension E4X node.
     *
     * Handler should return <em>2</em> to indicate that this message shouldn't
     * be further processed, <em>1</em> to stop other extensions processing,
     * but showing this message in chat pane, or any other value to continuing
     * processing with other extensions handlers.
     *
     * @tparam String ns   Namespace of message stanzas extension which should
     *  be handled by <code>handler</code>.
     * @tparam Function handler   Function or Generator which should handle
     *  requests.
     *
     *  @public
     */
    addMessageService: function(ns, handler)
    {
        this._messageHandlers[ns] = handler;
    },

    publishDiscoItems: function(node, itemNode, itemName, checkPerms)
    {
        var v = {node: itemNode, name: itemName, checkPerms: checkPerms};

        if (!this._items[node])
            this._items[node] = [v];
        else
            this._items[node].push(v);
    },

    publishDiscoIdentity: function(nodes, identity)
    {
        if (nodes == null || nodes.length == 0)
            nodes = [""];

        for (i = 0; i < nodes.length; i++) {
            if (this._identities[nodes[i]])
                this._identities[nodes[i]].push(identity);
            else
                this._identities[nodes[i]] = [identity];
        }
    },

    publishDiscoInfo: function(ns, nodes, identity)
    {
        nodes = nodes instanceof Array ? nodes : nodes == null ? [] : [nodes];
        if (nodes.length == 0)
            nodes[0] = "";

        if (identity)
            this.publishDiscoIdentity(nodes, identity);

        for (i = 0; i < nodes.length; i++) {
            if (this._nodes[nodes[i]])
                this._nodes[nodes[i]].push(ns);
            else
                this._nodes[nodes[i]] = [ns];
        }
        if (this._initialPresenceSent)
            account.setPresence(account.currentPresence);
    },

    unpublishDiscoInfo: function(ns, nodes) {
        nodes = nodes instanceof Array ? nodes : nodes == null ? [""] : [nodes];

        if (nodes.length == 0)
            nodes[0] = "";

        for (var i = 0; i < nodes.length; i++) {
            var idx, node = this._nodes[nodes[i]];
            if (!node)
                continue;

            if ((idx = node.indexOf(ns)) < 0)
                continue;

            node.splice(idx, 1);

            if (node.length == 0)
                delete this._nodes[nodes[i]];
        }
        if (this._initialPresenceSent)
            account.setPresence(account.currentPresence);
    },

    appendCapsToPresence: function(node)
    {
        var identities = [i.category+"/"+(i.type||"")+"//"+(i.name||"")+">"
                          for each (i in this._identities[""]||[])];
        var features = [n+">" for each (n in this._nodes[""]||[])];

        this._capsHash = b64_sha1(identities.sort().join("")+features.sort().join(""));

        var capsNode = node.ownerDocument.
            createElementNS("http://jabber.org/protocol/caps", "c");

        capsNode.setAttribute("hash", "sha-1");
        capsNode.setAttribute("node", this._capsPrefix);
        capsNode.setAttribute("ver", this._capsHash);

        node.appendChild(capsNode);

        this._initialPresenceSent = true;
    },

    dispatchIQ: function(pkt, query)
    {
        var response, callback;
        var ns = query.namespaceURI;

        switch (ns) {
        case "http://jabber.org/protocol/disco#info":
            if (pkt.getType() != "get" || query.localName != "query")
                break;

            {
                default xml namespace = "http://jabber.org/protocol/disco#info";
                var nodes = [], features = {}, identities = [];
                var node = query.getAttribute("node");

                response = <query/>;

                if (!node || node == this._capsPrefix+"#"+this._capsHash) {
                    if (node)
                        response.@node = node;
                    identities = this._identities[""];
                    nodes = [""];
                } else {
                    response.@node = node;

                    if (this._nodes[node]) {
                        identities = this._identities[node] || [];
                        nodes = [node];
                    } else
                        nodes = [];
                }

                for each (var id in identities)
                    response.* += <identity category={id.category} type={id.type} name={id.name}/>

                for (var i = 0; i < nodes.length; i++) {
                    var ns = this._nodes[nodes[i]];
                    for (var j = 0; j < ns.length; j++)
                        if (!features[ns[j]]) {
                            features[ns[j]] = 1;
                            response.* += <feature var={ns[j]}/>
                        }
                }
            }
            break;

        case "http://jabber.org/protocol/disco#items":
            if (pkt.getType() != "get" || query.localName != "query")
                break;
            {
                default xml namespace = "http://jabber.org/protocol/disco#items";

                response = <query/>;
                var node = query.getAttribute("node")||"";

                if (node)
                    response.@node = node;

                var items = this._items[node] || [];
                var from = new JID(pkt.getFrom());

                for (var i = 0; i < items.length; i++)
                    if (!items[i].checkPerms || items[i].checkPerms(from, items[i].node, node))
                        response.* += <item jid={account.myJID} node={items[i].node} name={items[i].name}/>
            }
            break;

        default:
            var service = this._iqHandlers[ns];

            if (!service) {
                if (pkt.getType() != "get" && pkt.getType() != "set")
                    return;

                response = {
                    type: "error",
                    dom: query,
                    e4x: <error xmlns="jabber:client" type="cancel" code="501">
                            <service-unavailable xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/>
                         </error>
                };
            } else {
                response = service(pkt, DOMtoE4X(query), query);

                if (response === 0)
                    break;
                else if (!response)
                    return;

                // We can't detect Generator reliable, so lets at least check
                // that it looks like Generator.
                if (typeof(response) == "object" && response.next && response.send) {
                    callback = new Callback(this._generatorTrackerCallback, this);
                    callback.addArgs(response, callback).fromCall();

                    response = response.next();
                }
            }
            break;
        }

        if (!response && (pkt.getType() == "get" || pkt.getType() == "set"))
            response = {
                type: "error",
                dom: query,
                e4x: <error xmlns="jabber:client" type="modify" code="400">
                        <bad-request xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/>
                     </error>
            };

        this._sendResponse(response, pkt, callback)
    },

    dispatchMessage: function(pkt, from)
    {
        var nodes = pkt.getNode().childNodes;

        for (var i = 0; i < nodes.length; i++) {
            var service = this._messageHandlers[nodes[i].namespaceURI];

            if (!service)
                continue;

            var res = service(pkt, nodes[i], from, DOMtoE4X(nodes[i]));
            if (res == 1)
                break;
            if (res == 2)
                return;
        }

        return;

        var item;
        if (from.resource) {
            item = account.getOrCreateResource(from);
            if (!item)
                item = account.getOrCreateContact(from.getShortJID(), true).
                    createResource(from);
        } else
            item = account.getOrCreateContact(from);

        item.onMessage(pkt);
    },

    sendIqWithGenerator: function(generator)
    {
        var response = generator.next();
        var callback = new Callback(this._generatorTrackerCallback, this);

        callback.addArgs(generator, callback).fromCall();

        this._sendResponse(response, null, callback);
    },

    _sendResponse: function(response, packet, callback)
    {
        if (!response)
            return;

        if (typeof(response) == "xml")
            response = {e4x: response};
        if (response instanceof Node)
            response = {dom: response};
        if (response instanceof Array)
            response = {domBuilder: response};

        var pkt = new JSJaCIQ();
        pkt.setIQ(response.to || packet && packet.getFrom(), response.type || "result",
                  response.id || packet && packet.getID());

        if (response.domBuilder)
            pkt.appendNode.apply(pkt, response.domBuilder);
        if (response.dom)
            pkt.appendNode(response.dom);
        if (response.e4x)
            pkt.appendNode(response.e4x);

        account.connection.send(pkt, callback);
    },

    _generatorTrackerCallback: function(service, callback, packet)
    {
        var query, queryEls = packet.getNode().childNodes;

        for (var i = 0; i < queryEls.length; i++)
            if (queryEls[i].nodeType == 1) {
                query = queryEls[i];
                break;
            }

        try {
            var queryE4X = query && DOMtoE4X(query);
            this._sendResponse(service.send([packet, queryE4X, query]), packet, callback);
        } catch (ex) {}
    },

    _clean: function()
    {
        this._initialPresenceSent = false;
    },

    _sendCaps: function()
    {
        if (this._initialPresenceSent)
            account.setPresence(account.currentPresence, account.currentPresence == account.userPresence);
    }
}

var servicesManager = new ServicesManager();

servicesManager.addIQService("jabber:iq:version", function (pkt, query) {
        if (pkt.getType() != "get")
            return null;

        return <query xmlns="jabber:iq:version">
                    <name>OneWeb</name>
                        <version>{"@@VERSION@@"}</version>
                        <os>{navigator.platform}</os>
                    </query>;
    });

servicesManager.publishDiscoIdentity([""], {category:"client", type:"pc", name:"OneWeb"});

servicesManager.publishDiscoInfo("http://jabber.org/protocol/disco#info");
servicesManager.publishDiscoInfo("http://jabber.org/protocol/muc");
servicesManager.publishDiscoInfo("jabber:x:conference");
servicesManager.publishDiscoInfo("http://jabber.org/protocol/chatstates");
servicesManager.publishDiscoInfo("http://jabber.org/protocol/xhtml-im");
