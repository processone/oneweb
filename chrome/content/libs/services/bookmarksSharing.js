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

var EXPORTED_SYMBOLS = ["bookmarksSharing"];

ML.importMod("exceptions.js");
ML.importMod("dateutils.js");

function BookmarksSharing() {
    this._bs = Components.classes["@mozilla.org/browser/nav-bookmarks-service;1"].
        getService(Components.interfaces.nsINavBookmarksService);
    this._ts = Components.classes["@mozilla.org/browser/tagging-service;1"].
        getService(Components.interfaces.nsITaggingService);
    this._ios = Components.classes["@mozilla.org/network/io-service;1"].
        getService(Components.interfaces.nsIIOService);

    this.init();
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

    pageIsShared: function(url) {
        this._trace(arguments);
        var uri = this._ios.newURI(url, null, null);
        var tags = this._ts.getTagsForURI(uri, {});

        return tags.indexOf("public") >= 0;
    },

    sharePage: function(url, title) {
        var uri = this._ios.newURI(url, null, null);

        if (!this._bs.isBookmarked(uri))
            this._bs.insertBookmark(this._bs.unfiledBookmarksFolder, uri, -1, title);

        this._ts.tagURI(uri, ["public"]);
    },

    unsharePage: function(url) {
        this._trace(arguments);
        var uri = this._ios.newURI(url, null, null);

        this._ts.untagURI(uri, ["public"]);
    },

    resetNewBookmarks: function() {
        var changes = {added: [], removed: []};

        for (var jid in this.newBookmarks)
            for (var url in this.newBookmarks[jid]) {
                changes.removed.push([jid, url]);
                account.cache.setValue("bookmarks-"+jid+"-"+url, this.newBookmarks[jid][1]);
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

        if (hasStamp && !this.foreignBookmarks[jid])
            this._pepHandler.getItems(from, new Callback(this._gotItems, this));

        for (var i = 0; i < data.added.length; i++) {
            var label = data.added[i].*::title.text();

            if (!this.foreignBookmarks[jid])
                this.foreignBookmarks[jid] = {};

            var date = account.cache.getValue("bookmarks-"+jid+"-"+data.added[i].@id);
            var exists = date != null;

            date = parseInt(date);

            if (isNaN(date) || date == 1) {
                date = hasStamp ? iso8601TimestampToDate(hasStamp.getAttribute("stamp")) :
                    new Date();

                account.cache.setValue("bookmarks-"+jid+"-"+data.added[i].@id, date);
            } else
                date = new Date(date);

            var fb = this.foreignBookmarks[jid][data.added[i].@id];
            if (!fb || fb[0] != label)
                this.foreignBookmarks[jid][data.added[i].@id] = [label, date];

            if (!this.newBookmarks[jid])
                this.newBookmarks[jid] = {};

            if (exists)
                continue;

            if (!(data.added[i].@id in this.newBookmarks[jid]))
                changes.added.push([jid, data.added[i].@id, label]);

            this.newBookmarks[jid][data.added[i].@id] = [label, date];
        }

        this.modelUpdated("foreignBookmarks");
        if (changes.added.length || changes.removed.length)
            this.modelUpdated("newBookmarks", changes);

        return 2;
    },

    _gotItems: function(from, items) {
        this._onPEPEvent(from, null, {added: items, removed: []});
    },

    _init: function() {
        if (!prefManager.getPref("oneweb.general.bookmarksSharing.enabled"))
            return;

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

        var state;

        for (i in this._modified) {
            if (i in this._prev && this._prev[i] == this._bookmarks[i])
                continue;

            if (!this._configuredNode)
                this._pepHandler.reconfigureNode({"pubsub#persist_items": 1,
                                                  "pubsub#notify_retract": 1});
            this._configuredNode = true;

            state = this._bookmarks[i] ? 1 : state == 1 ? 1 : 2;

            if (this._bookmarks[i])
                this._pepHandler.publishItem(i, [["title",
                                                  [this._bookmarks[i]]]]);
            else
                this._pepHandler.retractItem(i);
        }
        this._modified = {};
        this._prev = {};

        if (state == 1)
            account.setGlobalMessage("bookmarkShared",
                                     _("Shared bookmark added"),
                                     300, 1500);
        else if (state == 2)
            account.setGlobalMessage("bookmarkUnshared",
                                     _("Shared bookmark removed"),
                                     300, 1500);
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
            if (!(itemId in this._bookmarksIds))
                return;

            this._bookmarksIds[itemId] = [this._updateBookmark(itemId, newValue, true), newValue];

            return;
        }

        if (property == "uri") {
            if (!(itemId in this._bookmarksIds))
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
            var title = this._bs.getItemTitle(itemId);
            this._bookmarksIds[itemId] = [this._updateBookmark(uri, title), title];
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
