var EXPORTED_SYMBOLS = ["uiUpdater"];

var uiUpdater = {
    _trace: function(args) {
        var name = "(unknown)";

        for (var i in bookmarksSharing)
            if (bookmarksSharing[i] == args.callee) {
                name = i;
                break;
            }

        dump(name+"("+Array.join(Array.map(args, uneval), ", ")+")\n");
    },
    windows: function() {
        var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"].
            getService(Components.interfaces.nsIWindowMediator);
        var ww = Components.classes["@mozilla.org/embedcomp/window-watcher;1"].
            getService(Components.interfaces.nsIWindowWatcher);

        ww.registerNotification(this);

        var br = wm.getEnumerator("navigator:browser");

        while (br.hasMoreElements()) {
            var win = br.getNext();
            var doc = win.document;
            var el = doc.getElementById("oneweb-status");

            dump(win+", "+doc+", "+el+"\n")
            if (el)
                yield [win, doc, el];
        }
    },

    observe: function(subject, topic, data) {
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

        pageIsShared: function(url) {
            return bookmarksSharing.pageIsShared(url);
        },

        sharePage: function(url, title) {
            bookmarksSharing.sharePage(url, title);
        }
    },

    handleEvent: function(event) {
        if (event.type != "load")
            return;
        event.target.removeEventListener("load", this, false);

        var el = event.target.getElementById("oneweb-status");
        if (!el)
            return;

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
                setTimeout(this._tryConnect, 5000);
        } else
            this.selfDisconnect = false;
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

    _tryConnect: function(showPrefs) {
        var ci = account.connectionInfo;

        if (ci.host && ci.user && ci.pass) {
            if (!account.connected)
                account.connect();
            return true;
        }

        if (showPrefs)
            account.showPrefs();

        return false;
    },

    init: function() {
        ML.importMod("model/account.js");

        account.registerView(this.onGlobalMessageChanged, this, "globalMessage");
        account.registerView(this.onConnectedChanged, this, "connected");

        bookmarksSharing.registerView(this.onNewBookmarkChanged, this, "newBookmarks");
        bookmarksSharing.registerView(this.onNewBookmarkChanged, this, "foreignBookmarks");


        if (!this._tryConnect(true))
            account.registerView(new Callback(this._tryConnect, this).addArgs(false), null,
                                 "connectionInfo");
    }
}
