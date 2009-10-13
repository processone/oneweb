var EXPORTED_SYMBOLS = ["bookmarksSharing"];

ML.importMod("exceptions.js");
ML.importMod("dateutils.js");

function BookmarksSharing() {
    this._bs = Components.classes["@mozilla.org/browser/nav-bookmarks-service;1"].
        getService(Components.interfaces.nsINavBookmarksService);
    this._ts = Components.classes["@mozilla.org/browser/tagging-service;1"].
        getService(Components.interfaces.nsITaggingService);

    this.init();

    this._bs.addObserver(this, false);

    var arr = this._ts.getURIsForTag("public");
    for (var i = 0; i < arr.length; i++) {
        var bookmarks = this._bs.getBookmarkIdsForURI(arr[i], {});
        for (var j = 0; j < bookmarks.length; j++) {
            var title = this._bs.getItemTitle(bookmarks[j]);

            this._bookmarksIds[bookmarks[j]] = [arr[i].spec, title];
            if (!(arr[i].spec in this._bookmarks) || title)
                this._bookmarks[arr[i].spec] = title;
        }
    }
    this._pepHandler = pepService.handlePEPNode("http://oneteam.im/bookmarksSharing",
                                                new Callback(this._onPEPEvent, this));
}
_DECL_(BookmarksSharing, null, Model).prototype = {
    _trace: function(args) {
        var name = "(unknown)";

        for (var i in bookmarksSharing)
            if (bookmarksSharing[i] == args.callee) {
                name = i;
                break;
            }

        dump(name+"("+Array.join(Array.map(args, uneval), ", ")+")\n");
    },

    foreignBookmarks: {},
    newBookmarks: {},

    _bookmarks: {},
    _prev: {},
    _bookmarksIds: {},
    _modified: {},

    resetNewBookmarks: function() {
        var changes = {added: [], removed: []};

        for (var jid in this.newBookmarks)
            for (var url in this.newBookmarks[jid]) {
                changes.removed.push([jid, url]);
                account.cache.setValue("bookmarks-"+jid+"-"+url, 1)
            }

        this.newBookmarks = {};
        this.modelUpdated("newBookmarks", changes);
    },

    _onPEPEvent: function(from, node, data, pkt) {
        var jid = from.normalizedJID.shortJID;

        if (jid == account.myJID.normalizedJID.shortJID)
            return 2;

        dump("PEPEVENT: "+uneval(data)+"\n");

        var changes = {added: [], removed: []};

        for (var i = 0; i < data.removed.length; i++) {
            if (!this.foreignBookmarks[jid])
                continue;

            delete this.foreignBookmarks[jid][data.removed[i]];
            account.cache.removeValue("bookmarks-"+jid+"-"+data.removed[i]);

            if (this.newBookmarks[jid] && (data.removed[i] in this.newBookmarks[jid]))
            {
                delete this.newBookmarks[jid][data.removed[i]];
                changes.removed.push([jid, data.removed[i]]);
            }
        }

        var hasStamp = pkt && pkt.getChild("delay", "urn:xmpp:delay");
        var stamp = hasStamp ?
            iso8601TimestampToDate(hasStamp.getAttribute("stamp")) : new Date();

        for (var i = 0; i < data.added.length; i++) {
            var label = data.added[i].*::title.text();

            if (!this.foreignBookmarks[jid])
                this.foreignBookmarks[jid] = {};

            this.foreignBookmarks[jid][data.added[i].@id] = [label, new Date()];

            if (!this.newBookmarks[jid])
                this.newBookmarks[jid] = {};

            if (account.cache.getValue("bookmarks-"+jid+"-"+data.added[i].@id))
                continue;

            if (!(data.added[i].@id in this.newBookmarks[jid]))
                changes.added.push([jid, data.added[i].@id, label]);

            this.newBookmarks[jid][data.added[i].@id] = [label, stamp];
        }

        this.modelUpdated("foreignBookmarks");
        this.modelUpdated("newBookmarks", changes);

        return 2;
    },

    // nsINavBookmarkObserver implemenetation
    onBeginUpdateBatch: function() {
        this._trace(arguments);
        this._inBatch = true;
    },

    onEndUpdateBatch: function(internal) {
        try{
        if (!internal)
            this._trace(arguments);

        for (i in this._modified) {
            if (i in this._prev && this._prev[i] == this._bookmarks[i])
                continue;

            if (!this._configuredNode)
                this._pepHandler.reconfigureNode({"pubsub#persist_items": 1,
                                                  "pubsub#notify_retract": 1});
            this._configuredNode = true;

            if (this._bookmarks[i])
                this._pepHandler.publishItem(i, [["title",
                                                  [this._bookmarks[i]]]]);
            else
                this._pepHandler.retractItem(i);
        }
        this._modified = {};
        this._prev = {};

        }catch(ex){dump(ex+"\n")}
        this._inBatch = false;
    },

    onItemAdded: function(itemId, parentId, index, itemType) {
        this._trace(arguments);
    },

    onBeforeItemRemoved: function(itemId, itemType) {
        this._trace(arguments);
    },

    onItemRemoved: function(itemId, parentId, index, itemType) {
        this._trace(arguments);

        if (!this._bookmarksIds[itemId])
            return;

        var uri = this._bookmarksIds[itemId][0];

        this._modified[uri] = 1;
        delete this._bookmarks[uri];
        delete this._bookmarksIds[itemId];

        if (!this._inBatch)
            this.onEndUpdateBatch(1);
    },

    _updateBookmark: function(bm, newTitle, onlyUpdate) {
        var uri = typeof(bm) == "number" ? this._bs.getBookmarkURI(bm).spec :
            bm.spec || bm;

        if (!this._bookmarks[uri]) {
            if (onlyUpdate)
                return uri;
        } else if (this._inBatch && this._modified[uri] && newTitle == null)
            return uri;

        if (this._inBatch && !this._prev[uri])
            this._prev[uri] = this._bookmarks[uri];

        this._bookmarks[uri] = newTitle || "";
        this._modified[uri] = 1;

        if (!this._inBatch)
            this.onEndUpdateBatch(1);

        return uri;
    },

    onItemChanged: function(itemId, property, isAnnotationProperty,
                            newValue, lastModified, itemType)
    {
        try{
        this._trace(arguments);

        if (property == "title") {
            if (!itemId in this._bookmarksIds)
                return;

            this._bookmarksIds[itemId] = [this._updateBookmark(itemId, newValue, true), newValue];

            return;
        }

        if (property == "uri") {
            if (!itemId in this._bookmarksIds)
                return;

            this._modified[this._bookmarksIds[itemId][0]] = 1;
            delete this._bookmarks[this._bookmarksIds[itemId][0]];
            this._bookmarksIds[itemId][0] = newValue;
            this._updateBookmark(itemId, this._bookmarksIds[itemId][1]);
            return;
        }

        if (property != "tags" || isAnnotationProperty)
            return;
        if (itemType == null)
            itemType = this._bs.getItemType(itemId);

        if (itemType != this._bs.TYPE_BOOKMARK)
            return;

        var uri = this._bs.getBookmarkURI(itemId);
        var tags = this._ts.getTagsForURI(uri, {}), title;

        if (tags.indexOf("public") >= 0) {
            this._updateBookmark(uri, this._bs.getItemTitle(itemId));
        } else if (uri.spec in this._bookmarks) {
            this._modified[uri.spec] = 1;
            delete this._bookmarks[uri.spec];
        }

        }catch(ex){dump(ex+"\n")}
    },

    onItemVisited: function(bookmarkId, visitID, time) {
        this._trace(arguments);
    },

    onItemMoved: function(itemId, oldParentId, oldIndex, newParentId,
                          newIndex, itemType)
    {
        this._trace(arguments);
    }
}

var bookmarksSharing = new BookmarksSharing();
