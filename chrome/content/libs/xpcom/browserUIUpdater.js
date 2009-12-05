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

var EXPORTED_SYMBOLS = ["uiUpdater"];

var uiUpdater = {
    _trace: function(args) {
        var name = "(unknown)";

        for (var i in this)
            if (this[i] == args.callee) {
                name = i;
                break;
            }

        dump(name+"("+Array.join(Array.map(args, uneval), ", ")+")\n");
    },

    windows: function() {
        var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"].
            getService(Components.interfaces.nsIWindowMediator);

        var br = wm.getEnumerator("navigator:browser");

        while (br.hasMoreElements()) {
            var win = br.getNext();
            var doc = win.document;
            var el = doc.getElementById("oneweb-status") || doc.getElementById("oneweb-panel");

            if (el)
                yield [win, doc, el];
        }
    },

    observe: function(subject, topic, data) {
        this._trace(arguments);
        if (topic != "domwindowopened")
            return;

        var win = subject.QueryInterface(Components.interfaces.nsIDOMWindow);
        win.addEventListener("load", this, false);
    },

    _service: {
        connected: false,

        commands: {
        },

        login: function() {
            uiUpdater._tryConnect(true);
        },

        logout: function() {
            uiUpdater.selfDisconnect = true;
            account.disconnect();
        },

        showPrefs: function() {
            account.showPrefs();
        },

        executeCommand: function(jid, command) {
            var response = <command xmlns="http://jabber.org/protocol/commands" node={command}/>

            var iq = new JSJaCIQ();
            iq.setIQ(jid, "set");
            iq.appendNode(response);

            account.connection.send(iq, new Callback(uiUpdater.onForm, uiUpdater));
        },

        pageIsShared: function(url) {
            return url ? bookmarksSharing.pageIsShared(url) : false;
        },

        sharePage: function(url, title) {
            bookmarksSharing.sharePage(url, title);
        },

        unsharePage: function(url) {
            bookmarksSharing.unsharePage(url);
        },

        get jid() {
            return account.myJID ? account.myJID.shortJID.toString() : '';
        },

        get password() {
            return account.connectionInfo.pass;
        },

        getPref: function(name) {
            return prefManager.getPref(name);
        },

        setPref: function(name, value) {
            prefManager.setPref(name, value);
        },

        setUserAndPass: function(jid, pass) {
            dump("SET USER AND PASS: "+jid+", "+pass+"\n");
            account.setUserAndPass(jid, pass, true);
        },

        setGlob: function(name, value) {
            __parent__[name] = value;
        }
    },

    handleEvent: function(event) {
        if (event.type != "load")
            return;
        event.target.removeEventListener("load", this, false);

        var el = event.target.getElementById("oneweb-status");
        if (el) {
            if (this._showPrefs)
                account.showPrefs();
        } else if ((el = event.target.getElementById("oneweb-panel"))) {
        } else
            return;

        this._firstWindowOpened = true;
        this._showPrefs = false;

        var ow = event.target.defaultView.OneWeb;

        ow.init(this._service);

        if (this._bookmarks)
            ow.onBookmarksChanged.apply(ow, this._bookmarks);
        if (this._globalMessage)
            ow.onGlobalMessageChanged(this._globalMessage);
    },

    _convertBookmarks: function(bookmarks) {
        var res = [], count = 0;

        for (var jid in bookmarks) {
            var c = {
                from: account.getContactOrResourceName(jid),
                bookmarks: []
            };

            for (var url in bookmarks[jid]) {
                c.bookmarks.push({
                    url: url,
                    title: bookmarks[jid][url][0],
                    date: bookmarks[jid][url][1]
                });
                count++;
            }

            if (!c.bookmarks.length)
                continue;

            c.bookmarks = c.bookmarks.sort(function(a, b) {
                return a.date.getTime() - b.date.getTime();
            });
            res.push(c);
        }
        res = res.sort(function(a,b) {
            return a.from > b.from ? 1 : a.from < b.from ? -1 : 0;
        });

        return [res, count];
    },

    onConnectedChanged: function() {
        this._service.connected = account.connected;

        if (!account.connected) {
            if (!this.selfDisconnect)
                setTimeout(function(t){t._tryConnect}, 5000, this);
        } else
            this.selfDisconnect = false;
    },

    onResourcesChanged: function(model, type, data) {
        dump("onResourcesChanged: "+(data.added||[]).length+", "+(data.removed||[]).length+"\n");
        if (data.added && data.added.length)
            for (var i = 0; i < data.added.length; i++) {
                if (!data.added[i].jid.resource || data.added[i].jid.resource.indexOf("OneWeb-") != 0)
                    continue;

                var di = new DiscoItem(data.added[i].jid, null, "http://jabber.org/protocol/commands");
                di.getDiscoItems(false, new Callback(this.onDiscoItems, this));
            }
        if (data.removed && data.removed.length)
            for (var i = 0; i < data.removed.length; i++)
                delete this._service.commands[data.removed[i].jid];
    },

    onForm: function(pkt) {
        if (pkt.getType() == "error") {
            account.setGlobalMessage("commandError",
                                     _("Command returned an error"),
                                     300, 1500);
            return;
        }

        var cmd = DOMtoE4X(pkt.getNode().getElementsByTagName("command")[0]);
        if (cmd.@status == "completed") {
            account.setGlobalMessage("commandCompleted",
                                     _("Command executed successfully"),
                                     300, 1500);
            return;
        }

        openDialogUniq("ow:adhoc", "chrome://oneweb/content/adhoc.xul",
                       "chrome,centerscreen", pkt);
    },

    onDiscoItems: function(di, items) {
        this._trace(arguments)
        try{
        if (items.length == 0)
            return;
        var c = this._service.commands[di.discoJID] = {
            name: account.getContactOrResourceName(di.discoJID),
            commands: {
            }
        }

        for (var i = 0; i < items.length; i++)
            c.commands[items[i].discoNode] = items[i].discoName;
        }catch(ex){dump(ex+"\n")}
    },

    onNewBookmarkChanged: function(model, prop, changes) {
        var [newBookmarks, newCount] = this._convertBookmarks(bookmarksSharing.newBookmarks);
        var [bookmarks, count] = this._convertBookmarks(bookmarksSharing.foreignBookmarks);

        this._bookmarks = [bookmarks, newBookmarks, newCount];

        for (data in this.windows()) {
            var [win, doc, el] = data;

            win.OneWeb.onBookmarksChanged(bookmarks, newBookmarks, newCount,
                                          function(){bookmarksSharing.resetNewBookmarks()});
        }

        if (this._newBookmarksToken)
            account.resetGlobalMessage(this._newBookmarksToken);

        delete this._newBookmarksToken;

        if (newCount)
            this._newBookmarksToken = account.setGlobalMessage(
                "newBookmarks", _("You received {0} new {0, plurals, bookmark, bookmarks}",
                                  newCount), 200);
    },

    onGlobalMessageChanged: function(model, prop, token) {
        this._globalMessage = token;

        for (data in this.windows()) {
            var [win, doc, el] = data;

            win.OneWeb.onGlobalMessageChanged(token);
        }
    },

    _tryConnectLazy: function() {
        if (this._lazyConnectTimeout)
            clearTimeout(this._lazyConnectTimeout)

        this._lazyConnectTimeout = setTimeout(function(t) {
            t._tryConnect(false);
        }, 5000, this);
    },

    _tryConnect: function(showPrefs) {
        this._trace(arguments);
        var ci = account.connectionInfo;
        showPrefs = false;

        if (ci.host && ci.user && ci.pass) {
            if (!account.connected)
                account.connect();
            return true;
        }

        if (showPrefs) {
            if (this._firstWindowOpened)
                account.showPrefs();
            else
                this._showPrefs = true;
        }

        return false;
    },

    init: function() {
        var ww = Components.classes["@mozilla.org/embedcomp/window-watcher;1"].
            getService(Components.interfaces.nsIWindowWatcher);

        ML.importMod("model/account.js");

        account.registerView(this.onGlobalMessageChanged, this, "globalMessage");
        account.registerView(this.onConnectedChanged, this, "connected");
        account.registerView(this.onResourcesChanged, this, "resources");

        bookmarksSharing._init();

        bookmarksSharing.registerView(this.onNewBookmarkChanged, this, "newBookmarks");
        bookmarksSharing.registerView(this.onNewBookmarkChanged, this, "foreignBookmarks");

        bookmarksSynchronising._init();

        ww.registerNotification(this);

        if (!this._tryConnect(true))
            account.registerView(new Callback(this._tryConnectLazy, this).addArgs(false), null,
                                 "connectionInfo");
    }
}
