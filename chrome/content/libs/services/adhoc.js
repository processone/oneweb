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
var EXPORTED_SYMBOLS = ["AdhocSession"];

var adhocCmdsSessions = {};
var adhocCmds = {
    "openedTabs": ["Get all opened tabs", function(pkt, query) {
        var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"].
            getService(Components.interfaces.nsIWindowMediator);
        var numWindows = 0, msg = "", msgHtml = "";
        var e = wm.getEnumerator("navigator:browser");

        while (e.hasMoreElements()) {
            var w = e.getNext();

            if (numWindows++ > 0) {
                msg += "\nTabs opened in window "+numWindows+":\n";
                msgHtml += "<br/>Tabs opened in window "+numWindows+":<br/>";
            }

            var browsers = w.gBrowser ? w.gBrowser.browsers : w.Browser.browsers;

            msgHtml += "<ul>"
            for (var i = 0; i < browsers.length; i++) {
                var b = browsers[i];
                msg += "  "+b.contentTitle+" [ "+b.currentURI.spec+" ]\n";
                msgHtml += "<li><a href=\""+xmlEscape(b.currentURI.spec)+"\">"+
                    xmlEscape(b.contentTitle||"(empty title)")+"</a></li>";
            }
            msgHtml += "</ul>"
        }
        if (numWindows == 0) {
            yield (
                <command xmlns="http://jabber.org/protocol/commands" status="completed">
                    <note>
                        You have no browser windows currently opened.
                    </note>
                </command>);

        } else {
            if (numWindows == 1) {
                msg = "All currently opened tabs:\n" + msg;
                msgHtml = "All currently opened tabs:<br/>" + msgHtml;
            } else {
                msg = "Tabs opened in window 1:\n" + msg;
                msgHtml = "Tabs opened in window 1:<br/>" + msgHtml;
            }

            var msgPkt = new JSJaCMessage();
            msgPkt.setTo(pkt.getFrom());
            msgPkt.setType("chat");
            msgPkt.setBody(msg);
            var dp = new DOMParser();
            var doc = dp.parseFromString("<html xmlns='http://jabber.org/protocol/xhtml-im'>"+
                                         "<body xmlns='http://www.w3.org/1999/xhtml'>"+
                                             msgHtml+"</body></html>", "text/xml");
            msgPkt.appendNode(doc.documentElement);
            msgPkt.appendNode("opened-tabs", {xmlns: "http://oneweb.im/command"}, []);

            account.connection.send(msgPkt);

            yield (
                <command xmlns="http://jabber.org/protocol/commands" status="completed">
                    <note>
                        Message with opened tabs was sent.
                    </note>
                </command>);
        }
    }],
    "openUrl": ["Open URL in new tab", function(pkt, query) {
        [pkt, query] = yield (
            <command xmlns="http://jabber.org/protocol/commands" status="executing">
                <actions execute="complete">
                    <complete/>
                </actions>
                <x xmlns="jabber:x:data" type="form">
                    <instruction>Please enter URL which should be opened in new tab</instruction>
                    <field var="url" label="URL" type="text-single"/>
                </x>
            </command>);

        if (query.@action == "cancel")
            yield (<command xmlns="http://jabber.org/protocol/commands" status="canceled"/>);
        else {
            var ns = new Namespace("jabber:x:data");
            var url = query..ns::field.(@var == "url").ns::value.toString();
            if (url)
                openLink(url);
            yield (
                <command xmlns="http://jabber.org/protocol/commands" status="completed">
                    <note>
                        Url was opened.
                    </note>
                </command>);
        }
    }],
    "searchBookmarks": ["Search bookmarks", function(pkt, query) {
        [pkt, query] = yield (
            <command xmlns="http://jabber.org/protocol/commands" status="executing">
                <actions execute="complete">
                    <complete/>
                </actions>
                <x xmlns="jabber:x:data" type="form">
                    <instruction>Please enter term which should be searched in your bookmarks</instruction>
                    <field var="terms" label="Search Term" type="text-single"/>
                </x>
            </command>);

        if (query.@action == "cancel")
            yield (<command xmlns="http://jabber.org/protocol/commands" status="canceled"/>);
        else {
            var ns = new Namespace("jabber:x:data");
            var terms = query..ns::field.(@var == "terms").ns::value.toString();
            var msg, msgHtml;

            var bs = Components.classes["@mozilla.org/browser/nav-bookmarks-service;1"].
                getService(Components.interfaces.nsINavBookmarksService);
            var hs = Components.classes["@mozilla.org/browser/nav-history-service;1"].
                getService(Components.interfaces.nsINavHistoryService);

            var options = hs.getNewQueryOptions();
            var queryObj = hs.getNewQuery();

            options.queryType = options.QUERY_TYPE_BOOKMARKS;
            queryObj.setFolders([bs.placesRoot], 1);
            queryObj.searchTerms = terms;

            var result = hs.executeQuery(queryObj, options);
            result.root.containerOpen = true;
            if (result.root.childCount) {
                msg = "List of bookmarks matching: '"+terms+"':\n";
                msgHtml = "List of bookmarks matching: '"+xmlEscape(terms)+"'<br/><ul>";
                for (var i = 0; i < result.root.childCount; i++) {
                    var c = result.root.getChild(i);
                    msg += "  "+c.title+" [ "+c.uri+" ]\n";
                    msgHtml += "<li><a href=\""+xmlEscape(c.uri)+"\">"+
                        xmlEscape(c.title||"(empty title)")+"</a></li>";
                }
                msgHtml += "</ul>"
            }
            result.root.containerOpen = false;

            if (!msg) {
                yield (
                    <command xmlns="http://jabber.org/protocol/commands" status="completed">
                        <note>
                            Your search returned no results.
                        </note>
                    </command>);

            } else {
                var msgPkt = new JSJaCMessage();
                msgPkt.setTo(pkt.getFrom());
                msgPkt.setType("chat");
                msgPkt.setBody(msg);

                var dp = new DOMParser();
                var doc = dp.parseFromString("<html xmlns='http://jabber.org/protocol/xhtml-im'>"+
                                             "<body xmlns='http://www.w3.org/1999/xhtml'>"+
                                                 msgHtml+"</body></html>", "text/xml");
                msgPkt.appendNode(doc.documentElement);
                msgPkt.appendNode("bookmarks-search", {xmlns: "http://oneweb.im/command"}, []);

                account.connection.send(msgPkt);

                yield (
                    <command xmlns="http://jabber.org/protocol/commands" status="completed">
                        <note>
                            Message with list of matching bookmarks was sent.
                        </note>
                    </command>);
            }
        }
    }]
};

function commandAllowed(jid, node) {
    var permission = account.permissions[node.toLowerCase()] || 0;
    var shortJID = jid.normalizedJID.shortJID;

    return permission == 2 || shortJID == account.myJID.normalizedJID.shortJID ||
            permission == 1 && account.contacts[shortJID];
}

servicesManager.addIQService("http://jabber.org/protocol/commands", function (pkt, query, queryDOM) {
    var jid = new JID(pkt.getFrom());
    var result;

    if (pkt.getType() != "set" || query.name().localName != "command")
        return 0;

    var node = query.@node.toString();

    if (!commandAllowed(jid, node))
        return {
            type: "error",
            dom: queryDOM,
            e4x: <error xmlns="jabber:client" type="cancel" code="500">
                    <forbidden xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/>
                 </error>
        };

    var sessionid = query.@sessionid.toString();

    try {
        if (sessionid) {
            if (!adhocCmdsSessions[sessionid])
                return {
                    type: "error",
                    dom: queryDOM,
                    e4x: <error xmlns="jabber:client" type="modify" code="400">
                            <bad-sessionid xmlns="http://jabber.org/protocol/commands"/>
                         </error>
                };
            result = adhocCmdsSessions[sessionid].send([pkt, query, queryDOM]);
        } else {
            if (!adhocCmds[node])
                return {
                    type: "error",
                    dom: queryDOM,
                    e4x: <error xmlns="jabber:client" type="cancel" code="404">
                            <item-not-found xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/>
                         </error>
                };
            sessionid = generateUniqueId();
            adhocCmdsSessions[sessionid] = adhocCmds[node][1](pkt, query, queryDOM);
            result = adhocCmdsSessions[sessionid].next();
        }
    } catch (ex) {
        alert(ex);
        return {
            type: "error",
            dom: queryDOM,
            e4x: <error xmlns="jabber:client" type="cancel" code="404">
                    <session-expired xmlns="http://jabber.org/protocol/commands"/>
                 </error>
        };
    }

    if (result.@status == "completed" || result.@status == "canceled")
        delete adhocCmdsSessions[sessionid];

    result.@sessionid = sessionid;
    result.@node = node;
    return result;
});

for (var i in adhocCmds) {
    servicesManager.publishDiscoItems("http://jabber.org/protocol/commands",
                                      i, adhocCmds[i][0], commandAllowed);
    servicesManager.publishDiscoInfo("http://jabber.org/protocol/commands",
                                     i, {name: adhocCmds[i][0],
                                         category: "automation",
                                         type: "command-node"});
    servicesManager.publishDiscoInfo("jabber:x:data", i);
}


servicesManager.addMessageService("http://oneweb.im/command", function(pkt, node, jid, nodeE4X) {
    var body = pkt.getNode().getElementsByTagNameNS("http://www.w3.org/1999/xhtml", "body")[0];
    if (!body)
        return 2;

    var browser = openLink("chrome://oneweb/content/result.html");
    if (!browser)
        return 2;

    browser.addEventListener("load", {
        handleEvent: function(ev) {
            this.browser.removeEventListener("load", this, true);

            this.win.data = this.val;
        },

        win: browser.contentWindow.wrappedJSObject,
        browser: browser,
        val: body.innerHTML
    }, true);

    return 2;
});

function AdhocSession(jid, command, listener) {
    this.jid = new JID(jid);
    this.command = command;
    this.listener = listener;

    this._sendCommand("execute");
}

_DECL_(AdhocSession).prototype =
{
    isFinished: false,
    canGoForward: true,
    canGoBack: false,

    goForward: function(data) {
        this._sendCommand(null, data);
    },

    goBack: function() {
        this._sendCommand("prev");
    },

    abort: function() {
        if (this.sessionid && !this.isFinished)
            this._sendCommand("cancel");

        this.isFinished = true;
        this.aborted = true;
    },

    _sendCommand: function(action, extraData) {
        var iq = new JSJaCIQ();
        iq.setIQ(this.jid, "set", this.id);

        var attrs = {
            xmlns: "http://jabber.org/protocol/commands",
            node: this.command
        };

        if (action)
            attrs.action = action;

        if (this.sessionid)
            attrs.sessionid = this.sessionid;

        dump("EXTRA DATA:"+uneval(extraData)+"\n");

        iq.appendNode("command", attrs, extraData == null ? [] : [extraData]);

        account.connection.send(iq, new Callback(this._onCommandResult, this));
    },

    _onCommandResult: function(pkt) {
        if (this.aborted)
            return;

        if (pkt.getType() != "result") {
            this.isFinished = true;
            this.canGoForward = this.canGoBack = false;

            this.listener.onAdhocError(this);

            return;
        }
        var cmd = DOMtoE4X(pkt.getNode().getElementsByTagName("command")[0]);

        const xns = new Namespace("jabber:x:data");
        const cns = new Namespace("http://jabber.org/protocol/commands");

        if (cmd.@status == "executing") {
            this.sessionid = cmd.@sessionid.toString();
            this.id = pkt.getID();
        }
        var actions = cmd.cns::actions;

        //workaround for bug in older oneweb
        if (actions.length() == 0)
            actions = cmd.cns::action;

        this.canGoBack = actions.cns::prev.length() > 0;
        this.canGoForward = actions.cns::next.length() > 0 ||
            actions.cns::complete.length() > 0;

        if (cmd.@status == "canceled" && this.aborted != 2) {
            this.aborted = true;
            return;
        }
        var notes = [note.text().toString() for each (note in cmd.cns::note)];
        var xdata = cmd.xns::x;

        if (cmd.@status == "completed") {
            this.isFinished = true;
            this.listener.onAdhocCompleted(this, notes, xdata);
        } else
            this.listener.onAdhocStep(this, notes, xdata);
    }
}
