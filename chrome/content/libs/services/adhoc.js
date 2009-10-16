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

            msgHtml += "<ul>"
            for (var i = 0; i < w.gBrowser.browsers.length; i++) {
                var b = w.gBrowser.browsers[i];
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
                <action execute="complete">
                    <complete/>
                </action>
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
                <action execute="complete">
                    <complete/>
                </action>
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
            queryObj.setFolders([bs.bookmarksMenuFolder], 1);
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
