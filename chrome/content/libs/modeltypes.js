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

var EXPORTED_SYMBOLS = ["View", "ContainerView", "Model", "RegsBundle"];

ML.importMod("utils.js");
ML.importMod("roles.js");

function View()
{
}

_DECL_(View).prototype =
{
    ROLE_REQUIRES: ["show", "destroy"]
}

function ContainerView()
{
}

_DECL_(ContainerView).prototype =
{
    ROLE_REQUIRES: ["containerNode", "afterlastItemNode", "itemComparator"],

    onItemAdded: function(item)
    {
        var a = 0, b = this.items.length-1, mid;
        while (a <= b) {
            mid = (a+b)>>1;
            val = this.itemComparator(item, this.items[mid]);
            if (val == 0) {
                a = mid;
                break;
            }
            if (val < 0)
                b = mid-1;
            else
                a = mid+1;
        }
        this.items.splice(a, 0, item);

        var node = item instanceof Node ? item : item.node;
        var insertBefore = this.items[a+1];
        insertBefore = insertBefore instanceof Node ? insertBefore :
            insertBefore ? insertBefore.node : this.afterlastItemNode;

        if (!node.parentNode || node.nextSibling != insertBefore)
            if (item instanceof Node)
                this.containerNode.insertBefore(item, insertBefore);
            else
                item.show(this.containerNode, insertBefore);
    },

    onItemRemoved: function(model)
    {
        for (var i = 0; i < this.items.length; i++)
            if (this.items[i].model == model) {
                if (this.items[i] instanceof Node)
                    this.containerNode.removeChild(this.items[i]);
                else
                    this.items[i].destroy();

                this.items.splice(i, 1);
                break;
            }
    },

    onItemUpdated: function(item)
    {
        var idx = this.items.indexOf(item);
        if (idx < 0)
            return;

        this.items.splice(idx, 1);
        this.onItemAdded(item);
    },

    onSortMethodChanged: function()
    {
        var items = this.items;
        this.items = [];
        for (var i = 0; i < items.length; i++)
            this.onItemAdded(items[i]);
    },

    getNextItemNode: function(item)
    {
        var idx = this.items.indexOf(item)+1;
        return this.items[idx] ? this.items[idx].node : this.afterlastItemNode;
    },

    destroy: function()
    {
        for (var i = 0; i < this.items.length; i++)
            if (this.items[i] instanceof Node)
                this.containerNode.removeChild(this.items[i]);
            else
                this.items[i].destroy();
    }
}

function Model()
{
}

_DECL_(Model).prototype =
{
    init: function()
    {
        this._views = new CallbacksList(true);
    },

    registerView: function(method, obj, prop, token)
    {
        var callback = new Callback(method, obj)
        this._views._registerCallback(callback, token, prop);

        return callback;
    },

    unregisterView: function(callback)
    {
        this._views._unregisterCallback(callback);
    },

    modelUpdated: function(prop, arg)
    {
        for each (var callback in this._views._iterateCallbacks(prop)) {
            try {
                callback(this, prop, arg);
            } catch (ex) {
                report('developer', 'error', ex, window);
            }

        }
    },

    _calcModificationFlags: function(oldValues)
    {
        flags = [];
        for (i in oldValues)
            if (this[i] != oldValues[i])
                flags.push(i, null);
        return flags;
    },

    _modelUpdatedCheck: function(oldValues)
    {
        var flags = this._calcModificationFlags(oldValues);
        for (var i = 0; i < flags.length; i++)
            this.modelUpdated(flags[i]);

        return flags;
    },

    _getViewsInfo: function()
    {
        var info = [];
        for (var i in this._views)
            if (this._views[i].length)
                info.push(i+": "+this._views[i].length);
        return info.join(", ");
    }
}

function RegsBundle(view)
{
    this._view = view;
    this._tokens = [];
}

_DECL_(RegsBundle).prototype =
{
    register: function(model, method)
    {
        var args = Array.slice(arguments, 2);
        args.unshift(method, this._view);

        this._tokens.push([model, model.registerView.apply(model, args)]);
    },

    unregister: function()
    {
        for (var i = 0; i < this._tokens.length; i++)
            this._tokens[i][0].unregisterView(this._tokens[i][1]);
        this._tokens = [];
    },

    unregisterFromModel: function(model)
    {
        for (var i = this._tokens.length-1; i >= 0; i--)
            if (this._tokens[i][0] == model) {
                this._tokens[i][0].unregisterView(this._tokens[i][1]);
                this._tokens.splice(i, 1);
            }
    },
}
