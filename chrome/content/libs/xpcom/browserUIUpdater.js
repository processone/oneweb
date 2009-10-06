var EXPORTED_SYMBOLS = ["uiUpdater"];

var uiUpdater = {
    windows: function() {
        var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"].
            getService(Components.interfaces.nsIWindowMediator);
        var br = wm.getEnumerator("navigator:browser");

        while (br.hasMoreElements()) {
            var win = br.getNext();
            var doc = win.document;
            var el = doc.getElementById("oneweb-status");

            if (el)
                yield [win, doc, el];
        }
    },

    onBookmarkChanged: function(token) {
        for (data in this.windows()) {
            var [win, doc, el] = data;

            win.OneWeb.onBookmarksChanged(token);
        }
    },

    onGlobalMessageChanged: function(token) {
        for (data in this.windows()) {
            var [win, doc, el] = data;
            win.OneWeb.onGlobalMessageChanged(token);
        }
    },

    init: function() {
        ML.importMod("model/account.js");

        account.registerView(this.onGlobalMessageChanged, this, "globalMessage");

        if (account.connectionInfo.host)
        try{
            account.connect();
        }catch(ex){alert(ex)}
        else
            account.showPrefs();

        //bookmarksSharing.registerView(this.onBookmarkChanged, this, "bookmarkChanged");
    }
}
