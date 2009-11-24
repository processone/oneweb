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

var EXPORTED_SYMBOLS = ["prefManager"];

function PrefManager()
{
    this.srv = Components.classes["@mozilla.org/preferences;1"].
        getService(Components.interfaces.nsIPrefBranch2);
    this.callbacks = {};
}

_DECL_(PrefManager).prototype =
{
    registerChangeCallback: function(callback, branch, notifyNow)
    {
        if (!this.callbacks[branch]) {
            this.callbacks[branch] = [callback];
            this.srv.addObserver(branch, this, false);
        } else if (this.callbacks[branch].indexOf(callback) < 0)
            this.callbacks[branch].push(callback);

        if (!notifyNow)
            return;

        var list = this.srv.getChildList(branch, {});

        for (var i = 0; i < list.length; i++)
            callback(list[i], this.getPref(list[i]));
    },

    unregisterChangeCallback: function(callback, branch)
    {
        if (branch != null) {
            var r = {};
            r[branch] = 1;
            branch = r;
        } else
            branch = Iterator(this.callbacks, true);

        for (i in branch) {
            var idx = this.callbacks[i] && this.callbacks[i].indexOf(callback);
            if (idx != null && idx >= 0) {
                this.callbacks[i].splice(idx, 1);
                if (this.callbacks[i].length == 0) {
                    this.srv.removeObserver(i, this)
                    delete this.callbacks[i];
                }
            }
        }
    },

    getPref: function(name)
    {
        try {
            var type = this.srv.getPrefType(name);
            return type == this.srv.PREF_BOOL ? this.srv.getBoolPref(name) :
                type == this.srv.PREF_INT ? this.srv.getIntPref(name) :
                type == this.srv.PREF_STRING ? this.srv.getCharPref(name) :
                null;
        } catch(ex) {
            return null;
        }
    },

    setPref: function(name, value)
    {
        const map = {
            "number": "setIntPref",
            "boolean": "setBoolPref"
        };
        try {
            this.srv[ map[typeof(value)] || "setCharPref" ](name, value);
        } catch(ex) { }
    },

    builtinPref: function(name)
    {
        return false;
    },

    deletePref: function(name)
    {
        try {
            this.srv.clearUserPref(name);
        } catch(ex) { }
    },

    observe: function(subject, topic, value)
    {
        var parts = value.split(/\./);
        var prefVal = this.getPref(value);

        for (var i = value.length-1; i > 0; i--) {
            var branch = parts.slice(0, i).join(".");
            if (!this.callbacks[branch])
                continue;

            for (var j = 0; j < this.callbacks[branch].length; j++)
                this.callbacks[branch][j].call(null, value, prefVal);
        }
    }
}

var prefManager = new PrefManager();
