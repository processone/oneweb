var EXPORTED_SYMBOLS = ["bookmarksSynchronising"];

Components.utils.import("resource://gre/modules/utils.js");

ML.importMod("exceptions.js");
ML.importMod("dateutils.js");
ML.importMod("utils.js");

var _bs = Components.classes["@mozilla.org/browser/nav-bookmarks-service;1"].
    getService(Components.interfaces.nsINavBookmarksService);
var _ts = Components.classes["@mozilla.org/browser/tagging-service;1"].
    getService(Components.interfaces.nsITaggingService);
var _ls = Components.classes["@mozilla.org/browser/livemark-service;2"].
    getService(Components.interfaces.nsILivemarkService);
var _hs = Components.classes["@mozilla.org/browser/nav-history-service;1"].
    getService(Components.interfaces.nsINavHistoryService);
var _ios = Components.classes["@mozilla.org/network/io-service;1"].
    getService(Components.interfaces.nsIIOService);

var _itemsMap = {};
var _waitList = {};
function createItemFromData(item, newItem) {
    var guid, obj;

    if (item.localName() == "item") {
        var name = item.*::*.localName();
        guid = item.@id.toString();

        if (!newItem && _itemsMap[guid]) {
            obj = _itemsMap[guid];
            obj.updateFromE4X(item);

            var wl = _waitList[guid] || [];
            if (wl.length)
                dump("PWL: "+guid+", "+wl.length+"\n");
            for (var i = 0; i < wl.length; i++)
                if (--wl[i].count == 0) {
                    wl[i].item.store(true, true);
                    wl.splice(i--, 1);
                }
        } else
            obj = name == "bookmark" ? new Bookmark(item) :
                name == "folder" ? new Folder(item) :
                name == "livemark" ? new Livemark(item) : null;
    } else {
        var name = item.localName();
        guid = item.@id.toString();

        if (!newItem && guid && _itemsMap[guid])
            obj = _itemsMap[guid];
        else
            obj = name == "bookmark" ? new Bookmark(guid) :
                name == "folder" ? new Folder(guid) :
                name == "livemark" ? new Livemark(guid) :
                name == "separator" ? new Separator() :
                name == "container" ? new Container(guid) : null;
    }

    if (guid && (!newItem || !_itemsMap[guid]))
        _itemsMap[guid] = obj;

    return obj;
}

function createItemFromId(id, newItem) {
    var guid, type = _bs.getItemType(id);

    if (type != _bs.TYPE_SEPARATOR)
        guid = _bs.getItemGUID(id);

    if (!newItem && guid && _itemsMap[guid])
        return _itemsMap[guid];

    var obj = type == _bs.TYPE_BOOKMARK ? new Bookmark(id) :
        type == _bs.TYPE_FOLDER ?
            (_ls.isLivemark(id) ? new Livemark(id) : new Folder(id)) :
        type == _bs.TYPE_SEPARATOR ? new Separator(id) :
        new Container(id);

    if (guid && (!newItem || !_itemsMap[guid]))
        _itemsMap[guid] = obj;

    return obj;
}

function Bookmark(data) {
    if (typeof(data) == "xml") {
        this.updateFromE4X(data);
    } else if (typeof(data) == "number")
        this._itemID = data;
    else
        this._guid = data;
}
_DECL_(Bookmark).prototype = {
    get guid() {
        if (!this._guid)
            this._guid = _bs.getItemGUID(this.itemID);

        return this._guid;
    },

    get itemID() {
        if (!this._itemID || this._itemID < 0)
            this._itemID = _bs.getItemIdForGUID(this.guid);

        return this._itemID;
    },

    updateFromE4X: function(data) {
        var bm = data.*::bookmark;
        this._guid = data.@id.toString();
        this.uri = bm.@uri.toString();
        this.title = bm.@title.toString();
        this.keyword = bm.@keyword.length() ? bm.@keyword.toString() : null;
        this.tags = [tag.text().toString() for each (tag in bm.*::tag)].sort();
    },

    updateFromStore: function() {
        this._populate(true);
    },

    serialize: function() {
        return ["bookmark", {id: this.guid}, []];
    },

    serializeFully: function() {
        this._populate();

        var attrs = {
            stamp: ++bookmarksSynchronising._lastChangeStamp,
            uri: this.uri,
            title: this.title
        }
        if (this.keyword != null)
            attrs.keyword = this.keyword;

        var tags = [["tag", {}, [tag]] for each (tag in this.tags)];

        return ["bookmark", attrs, tags];
    },

    get canBeStored() {
        this._populate();

        return this.uri;
    },

    canBeSent: true,

    store: function(internal) {
        this._populate();

        if (this.itemID < 0)
            return;

        var uri = _ios.newURI(this.uri, null, null);

        if (!internal) {
            _bs.setItemTitle(this.itemID, this.title);
            _bs.changeBookmarkURI(this.itemID, uri);
        }
try{
        if (this.keyword)
            _bs.setKeywordForBookmark(this.itemID, this.keyword);

        var tags = _ts.getTagsForURI(uri, {});
        var [toAdd,,toDelete] = compareArrays(this.tags, tags);

        dump("TAGS CH: "+uneval(tags)+", "+uneval(this.tags)+", "+uneval(toAdd)+", "+uneval(toDelete)+"\n")

        _ts.tagURI(uri, toAdd);
        _ts.untagURI(uri, toDelete);
}catch(ex){alert(ex)}
    },

    insert: function(parent, index) {
        this._populate();

        var uri = _ios.newURI(this.uri, null, null);

        if (this.itemID < 0) {
            this._itemID = _bs.insertBookmark(parent, uri,
                                              index, this.title);

            _bs.setItemGUID(this.itemID, this.guid);
            this.store(true);
        } else {
            dump("BM INSERT: "+this.itemID+", "+parent+", "+index+"\n");
            _bs.moveItem(this.itemID, parent, index);
            this.store();
        }
    },

    equals: function(b) {
        if (!this.equalsShalow(b))
            return false;

        this._populate();
        b._populate();

        if (this.tags.length != b.tags.length)
            return false;
        for (var i = 0; i < this.tags.length; i++)
            if (this.tags[i] != b.tags[i])
                return false;

        return this.uri == b.uri && this.title == b.title && this.keyword == b.keyword;
    },

    equalsShalow: function(b) {
        return this.constructor == b.constructor && this.guid == b.guid;
    },

    destroy: function() {
        delete _itemsMap[this.guid];
    },

    _populate: function(force) {
        if ((!force && this.uri) || this.itemID < 0)
            return;

        var uri = _bs.getBookmarkURI(this.itemID);

        this.uri = uri.spec;
        this.title = _bs.getItemTitle(this.itemID);
        this.keyword = _bs.getKeywordForBookmark(this.itemID);
        this.tags = _ts.getTagsForURI(uri, {});
    }
}

function Folder(data) {
    if (typeof(data) == "xml") {
        this.updateFromE4X(data);
    } else if (typeof(data) == "number")
        this._itemID = data;
    else
        this._guid = data;
}
_DECL_(Folder, Bookmark).prototype = {
    get guid() {
        if (!this._guid) {
            var id = this.itemID;

            this._guid =
                id == _bs.bookmarksMenuFolder ? "bmf" :
                id == _bs.unfiledBookmarksFolder ? "ubf" :
                id == _bs.toolbarFolder ? "tf" :
                _bs.getItemGUID(id);
        }

        return this._guid;
    },

    get itemID() {
        if (!this._itemID || this._itemID < 0) {
            var guid = this.guid;

            this._itemID =
                guid == "bmf" ? _bs.bookmarksMenuFolder :
                guid == "ubf" ? _bs.unfiledBookmarksFolder :
                guid == "tf" ? _bs.toolbarFolder :
                _bs.getItemIdForGUID(guid);
        }
        return this._itemID;
    },

    updateFromE4X: function(data) {
        var items = this.items;
        var fl = data.*::folder;

        this._guid = data.@id.toString();
        this.title = fl.@title.toString();
        this.items = [createItemFromData(item) for each (item in fl.*::*)];

        if (items && items.length) {
            var [,,toDelete] = compareArrays(this.items, items);
            for (var i = 0; i < toDelete.length; i++)
                toDelete[i].destroy();
        }
    },

    serialize: function() {
        return ["folder", {id: this.guid}, []];
    },

    serializeFully: function() {
        this._populate();
        dump("SERIALIZE1\n")

        dump("SERIALIZE: "+(this.items&&this.items.length)+"\n");

        var attrs = {
            stamp: ++bookmarksSynchronising._lastChangeStamp,
            title: this.title
        }
        if (this.keyword != null)
            attrs.keyword = this.keyword;

        var items = [item.serialize() for each (item in this.items)];

        return ["folder", attrs, items];
    },

    get canBeStored() {
        this._populate();

        return this.items;
    },

    store: function(internal, fromWL) {
        this._populate();

        if (this.itemID < 0)
            return;

        if (!internal)
            _bs.setItemTitle(this.itemID, this.title);

        if (!fromWL) {
            if (this._pendingStore)
                return;

            var token = {
                count: 0,
                item: this
            };

            for (var i = 0; i < this.items.length; i++) {
                if (!this.items[i].canBeStored) {
                    if (!_waitList[this.items[i].guid])
                        _waitList[this.items[i].guid] = [];
                    _waitList[this.items[i].guid].push(token);
                    token.count++;
                    dump("CANT STORE: "+ this.guid+", "+this.items[i].guid+"\n");
                }
            }
            if (token.count) {
                this._pendingStore = true;
                return;
            }
        }

        dump("REAL STORE: "+this.guid+", "+this.itemID+", "+this.items.length+"\n");

        this._pendingStore = false;

        for (var i = 0, idx = 0; i < this.items.length; i++, idx)
            idx += this.items[i].insert(this.itemID, idx) ? 0 : 1;

        var id;
        while ((id = _bs.getIdForItemAt(this.itemID, idx)) >= 0) {
            var guid = _bs.getItemGUID(id);
            if (_itemsMap[guid])
                _itemsMap[guid].destroy();
            _bs.removeItem(id);
        }
    },

    insert: function(parent, index) {
        if (this.itemID < 0) {
            this._itemID = _bs.createFolder(parent, this.title, index);
            _bs.setItemGUID(this.itemID, this.guid);
            this.store(false);
        } else {
            _bs.moveItem(this.itemID, parent, index);
            this.store(true);
        }
    },

    equals: function(b, onlyItems) {
        if (!this.equalsShalow(b))
            return false;

        this._populate();
        b._populate();

        if (!onlyItems && this.title != b.title)
            return false;

        if (this.items.length != b.items.length)
            return false;

        for (var i = 0; i < this.items.length; i++)
            if (!this.items[i].equalsShalow(b.items[i]))
                return false;

        return true;
    },

    _populate: function(force) {
        if ((!force && this.items) || this.itemID < 0)
            return;

        this.title = _bs.getItemTitle(this.itemID);

        var query = _hs.getNewQuery();
        var options = _hs.getNewQueryOptions();

        query.setFolders([this.itemID], 1);
        var root = _hs.executeQuery(query, options).root;
        root.containerOpen = true;

        var items = this.items || [];

        this.items = [];
        for (var i = 0; i < root.childCount; i++)
            this.items[i] = createItemFromId(root.getChild(i).itemId);

        dump("FOLDER POPULATE: "+root.childCount+", "+this.items.length+"\n");

        root.containerOpen = false;

        var [,,toDelete] = compareArrays(this.items, items);
        for (var i = 0; i < toDelete.length; i++)
            toDelete[i].destroy();

        dump("FOLDER POPULATE2: "+this.items.length+"\n");
    }
}

function Livemark(data) {
    if (typeof(data) == "xml") {
        this.updateFromE4X(data);
    } else if (typeof(data) == "number")
        this._itemID = data;
    else
        this._guid = data;
}
_DECL_(Livemark, Bookmark).prototype = {
    updateFromE4X: function(data) {
        var lm = data.*::livemark;
        this._guid = data.@id.toString();
        this.title = lm.@title.toString();
        this.siteURI = lm.@siteURI.toString();
        this.feedURI = lm.@feedURI.toString();
    },

    serialize: function() {
        return ["livemark", {id: this.guid}, []];
    },

    serializeFully: function() {
        this._populate();

        var attrs = {
            stamp: ++bookmarksSynchronising._lastChangeStamp,
            title: this.title,
            siteURI: this.siteURI,
            feedURI: this.feedURI
        }

        return ["livemark", attrs, []];
    },

    get canBeStored() {
        this._populate();

        return this.siteURI;
    },

    store: function() {
        this._populate();

        if (this.itemID < 0)
            return;

        var siteURI = _ios.newURI(this.siteURI, null, null);
        var feedURI = _ios.newURI(this.feedURI, null, null);

        _bs.setItemTitle(this.itemID, this.title);
        _ls.setSiteURI(this.itemID, siteURI);
        _ls.setFeedURI(this.itemID, feedURI);
    },

    insert: function(parent, index) {
        this._populate();

        var siteURI = _ios.newURI(this.siteURI, null, null);
        var feedURI = _ios.newURI(this.feedURI, null, null);

        if (this.itemID < 0) {
            this._itemID = _ls.createLivemark(parent, this.title, siteURI,
                                              feedURI, index);
            _bs.setItemGUID(this.itemID, this.guid);
        } else {
            _bs.moveItem(this.itemID, parent, index);
            this.store();
        }
    },

    equals: function(b) {
        if (!this.equalsShalow(b))
            return false;

        this._populate();
        b._populate();

        return this.title == b.title && this.siteURI == b.siteURI &&
            this.feedURI == b.feedURI;
    },

    _populate: function(force) {
        if ((!force && this.siteURI) || this.itemID < 0)
            return;

        this.title = _bs.getItemTitle(this.itemID);
        this.siteURI = _ls.getSiteURI(this.itemID).spec
        this.feedURI = _ls.getFeedURI(this.itemID).spec
    }
}

function Separator(data) {
}
_DECL_(Separator).prototype = {
    serialize: function() {
        return ["separator", {}, []];
    },

    canBeStored: true,

    canBeSent: false,

    store: function() {

    },

    insert: function(parent, index) {
        _bs.insertSeparator(parent, index);
    },

    equals: function(b) {
        return this.equalsShalow(b);
    },

    equalsShalow: function(b) {
        return this.constructor == b.constructor;
    },

    destroy: function() {
    }
}

var _containersCache = {};
function Container(data) {
    if (typeof(data) == "number")
        this._itemID = data;
    else
        this._guid = data;
}
_DECL_(Container, Bookmark).prototype = {
    serialize: function() {
        return ["container", {id: this.guid}, []];
    },

    canBeStored: true,

    canBeSent: false,

    store: function() {

    },

    insert: function(parent, index) {
        if (this.itemID < 0) {
            var query = _hs.getNewQuery();
            var options = _hs.getNewQueryOptions();

            query.setFolders([parent], 1);
            var root = _hs.executeQuery(query, options).root;
            root.containerOpen = true;

            this.items = [];
            for (var i = 0; i < root.childCount; i++) {
                var child = root.getChild(i);
                if (child.type == child.RESULT_TYPE_DYNAMIC_CONTAINER &&
                    !_containersCache[child.itemId])
                {
                    this._itemID = child.itemId;
                    _containersCache[child.itemId] = this;
                    break;
                }
            }
            root.containerOpen = false;
        }

        if (this._itemID < 0)
            return true;

        _bs.setItemGUID(this.itemID, this.guid);
        _bs.moveItem(this.itemID, parent, index);

        return false;
    },

    equals: function(b) {
        return this.equalsShalow(b);
    },

    destroy: function() {
        delete this._containersCache[this.itemID];
    }
}

function BookmarksSynchronising() {
    this.init();
}
_DECL_(BookmarksSynchronising, null, Model).prototype = {
    _itemsPushed: null,
    _internalOp: 0,
    _clear: 0,

    _roots: [_bs.bookmarksMenuFolder,
             _bs.unfiledBookmarksFolder,
             _bs.toolbarFolder],

    _trace: function(args) {
        var name = "(unknown)";

        for (var i in this)
            if (this[i] == args.callee) {
                name = i;
                break;
            }

        dump(this.constructor.name+"."+name+"("+Array.join(Array.map(args, uneval), ", ")+")\n");
    },

    get _lastChangeStamp() {
        if (this.__lastChangeStamp)
            return this.__lastChangeStamp;

        return this._clear ? 1 : (account.cache.getValue("bookmarks-stamp") || 1);
    },

    set _lastChangeStamp(val) {
        if (val > this._lastChangeStamp) {
            this.__lastChangeStamp = val;
            account.cache.setValue("bookmarks-stamp", val);
        }

        return val;
    },

    _onConnect: function() {
        if (this.unactive)
            return;

        if (account.connected) {
            if (this._clear) {
                this._bmh.deleteNode(new Callback(this._pushEverything, this));
            } else
                this._retrieveLastChanges();

            _bs.addObserver(this, false);
        } else
            try {
                _bs.removeObserver(this);
            } catch (ex) {}
    },

    _onBookmarkEvent: function(from, node, data, pkt) {
        var jid = from.normalizedJID.shortJID;

        if (jid != account.myJID.normalizedJID.shortJID)
            return 2;

        this._setItems(data);

        return 2;
    },

    _pktsQueue: [],
    _queue: function(pkt) {
        if (pkt)
            this._pktsQueue.push(pkt);

        var sent = 0;

        while (this._pktsQueue.length && this._configSent != 1) {
            var size = this._pktsQueue[0].xml().length;

            if (!this._configSent && (sent + size > 2000 && sent > 0)) {
                setTimeout(function(t){t._queue()}, 1000, this);
                return;
            }

            dump("QUEUE SEND: "+size+", "+this._pktsQueue.length+"\n")

            account.connection.send(this._pktsQueue.shift(), this._configSent ?
                                    null : new Callback(this._configureNode, this));
            sent += size;

            if (!this._configSent)
                this._configSent = 1;
        }
    },

    _configureNode: function () {
        this._configSent = 1;
        this._bmh.reconfigureNode({
            "pubsub#persist_items": 1,
            "pubsub#notify_retract": 1,
            "pubsub#max_items": 1000,
            "pubsub#access_model": "whitelist"
        }, new Callback(this._onNodeConfigured, this));
    },

    _onNodeConfigured: function(type, pkt) {
        this._trace(arguments);

        if (type) {
            account.setGlobalMessage("syncDisabled",
                                     _("Bookmarks synchronisation disabled"),
                                     300, 5000);
            this._bmh.destroy();
            this._bmh.deleteNode();
            _bs.removeObserver(this);
            this.unactive = true;

            this.__lastChangeStamp = 0;
            this._lastChangeStamp = 1;

            this._pktsQueue = [];

            return;
        }
        this._configSent = 2;

        this._queue();
    },

    _pushEverything: function() {
        this._trace(arguments);

        for (var i = 0; i < this._roots.length; i++)
            this._sendFolder(createItemFromId(this._roots[i]));
    },

    _retrieveLastChanges: function() {
        if (this._clear)
            return;
        this._trace(arguments);
        this._bmh.getItems(null, new Callback(this._gotItems, this), 10)
    },

    _retrieveEverything: function() {
        if (this._clear)
            return;
        this._trace(arguments);
        this._bmh.getItems(null, new Callback(this._gotItems, this).addArgs(true));
    },

    _gotItems: function(from, data, error, inFetchAll) {
        if ((error == "item-not-found" || data.length == 1) && !this._itemsPushed)
            this._pushEverything();
        else {
            this._setItems({added: data.reverse()}, inFetchAll);
            this._configSent = 2;
        }

        this._itemsPushed = true;
    },

    _setItems: function(data, inFetchAll) {
        //this._trace(arguments);
        dump(">>> SETITEMS\n");

        this._internalOp++;
        try{

        var added = data.added || [];

        if (!inFetchAll) {
            var min = Infinity, max = -Infinity
            for (var i = 0; i < added.length; i++) {
                stamp = +added[i].*::*.@stamp;
                if (min > stamp)
                    min = stamp;
                if (max <  stamp)
                    max = stamp;
            }
            //dump("SI: "+added.length+", "+min+", "+max+", "+this._lastChangeStamp+"\n");
            if ((min > this._lastChangeStamp || max < this._lastChangeStamp) && !this._itemsRetrieved) {
                this.__lastChangeStamp = 1;
                this._retrieveEverything();

                return;
            }
        }

        this._itemsRetrieved = true;

        var stamp = this._lastChangeStamp;
        for (var i = 0; i < added.length; i++)
            if (stamp < +added[i].*::*.@stamp) {
                var item = createItemFromData(added[i]);
//                dump("IT: "+uneval(item)+","+added[i]+"\n")
                this._lastChangeStamp = +added[i].*::*.@stamp;

                item.store();
            }

        var removed = data.removed || [];
        for (var i = 0; i < removed.length; i++)
            if (_itemsMap[removed[i]])
                _itemsMap[removed[i]].destroy();
        }catch(ex){dump(ex)+"\n"}
        dump("<<< SETITEMS\n");
        this._internalOp--;
    },

    _sendFolder: function(folder, dontUpdate) {
        this._trace(arguments);
//        if (!this._clear)
//            return;
        if (!dontUpdate)
            folder.updateFromStore();

        if (folder instanceof Folder) {
            folder._populate();

            for (var i = 0; i < folder.items.length; i++)
                if (folder.items[i].canBeSent)
                    this._sendFolder(folder.items[i]);
        }
        this._sendItem(folder);
    },

    _sendItem: function(item, dontUpdate) {
        this._trace(arguments);
//        if (!this._clear)
//            return;
        if (!item.canBeSent)
            return;

        if (!dontUpdate)
            item.updateFromStore();

        this._queue(this._bmh.publishItem(item.guid, [item.serializeFully()], true));
    },

    _removeItem: function(item) {
        this._queue(this._bmh.retractItem(item.guid, true));
    },

    _skipItem: function(id, parent) {
        if (this._roots.indexOf(id) >= 0)
            return false;

        if (!parent)
            parent = _bs.getFolderIdForItem(id);

        while (parent >= 0) {
            dump("PARENT: "+parent+"\n")
            if (this._roots.indexOf(parent) >= 0)
                return false;

            var oldParent = parent;

            parent = _bs.getFolderIdForItem(id);

            if (parent == oldParent)
                return true;
        }

        return true;
    },

    // nsINavBookmarkObserver implemenetation
    onBeginUpdateBatch: function() {
        this._trace(arguments);
    },

    onEndUpdateBatch: function(internal) {
        this._trace(arguments);
    },

    onItemAdded: function(itemId, parentId, index, itemType) {
        this._trace(arguments);

        if (this._internalOp || _ls.isLivemark(parentId) || this._skipItem(itemId, parentId))
            return;

        this._sendItem(createItemFromId(itemId), true);
        this._sendItem(createItemFromId(parentId));
    },

    onBeforeItemRemoved: function(itemId, itemType) {
        this._trace(arguments);
    },

    onItemRemoved: function(itemId, parentId, index, itemType) {
        this._trace(arguments);

        if (this._internalOp || _ls.isLivemark(parentId) || this._skipItem(itemId, parentId))
            return;

        this._sendItem(createItemFromId(parentId));
        this._removeItem(createItemFromId(itemId));
    },

    onItemChanged: function(itemId, property, isAnnotationProperty,
                            newValue, lastModified, itemType)
    {
        this._trace(arguments);

        if (this._internalOp || this._skipItem(itemId))
            return;

        var interestingAnnos = ["bookmarkProperties/description",
                                "bookmarkProperties/loadInSidebar", "bookmarks/staticTitle",
                                "livemark/feedURI", "livemark/siteURI", "microsummary/generatorURI"];

        if (isAnnotationProperty && interestingAnnos.indexOf(property) < 0)
            return;

        this._sendItem(createItemFromId(itemId));
    },

    onItemVisited: function(bookmarkId, visitID, time) {
        this._trace(arguments);
    },

    onItemMoved: function(itemId, oldParentId, oldIndex, newParentId,
                          newIndex, itemType)
    {
        this._trace(arguments);

        if (this._internalOp)
            return;

        if (!this._skipItem(itemId, oldParentId))
            this._sendItem(createItemFromId(oldParentId));
        if (oldParentId != newParentId && ! this._skipItem(itemId, newParentId))
            this._sendItem(createItemFromId(newParentId));
    },

    _init: function() {
        this._trace(arguments);

        if (!prefManager.getPref("oneweb.general.bookmarksSync.enabled"))
            return;

        this._bmh = pepService.handlePEPNode("http://oneteam.im/bookmarks",
                                             new Callback(this._onBookmarkEvent, this));
        account.registerView(this._onConnect, this, "connected");
    }
}

var bookmarksSynchronising = new BookmarksSynchronising();
