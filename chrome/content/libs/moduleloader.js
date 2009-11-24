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

function MLP() {
    var gs = Components.classes["@oneweb.im/loader;1"].
        getService(Components.interfaces.nsISupports);

    this.loader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"].
        getService(Components.interfaces.mozIJSSubScriptLoader);
    this.loadedscripts = {};

    this.gs = gs.wrappedJSObject;
    var i, tmp = this.gs.__parent__;

    tmp.init(window);
}

MLP.prototype =
{
    /**
     * List of paths to script handled by moduleloader.
     * @type Array<String>
     * @public
     */
    paths: ["chrome://oneweb/content/libs"],

    /**
     * Loads script. Throws exception if script can't be loaded.
     *
     * @tparam String script String with path to script. Script will be
     *  finded in all paths defined in paths property.
     * @tparam bool asPrivate If set to \em true all symbols from this
     *   script will be available only in current scope.
     *
     * @public
     */
    importMod: function(script, asPrivate, everything)
    {
        if (this.loadedscripts[script])
            return;

        this.loadedscripts[script] = true;

        if (asPrivate) {
            throw new Error("TODO private importMod");
            try {
                var scope = {};
                this.symbolsToExport = "";
                this.loader.loadSubScript("chrome://jabberzilla2/content/"+script,
                        scope);

                var i, tmp = this.symbolsToExport.split(/\s+/);

                for (i = 0; i < tmp.length; i++)
                    this.__parent__[tmp[i]] = scope[tmp[i]];
                return;
            } catch (ex) {
                delete this.loadedscripts[script];
                alert(ex);
                throw new Error(
                    "ML.importMod error: unable to import '"+script+"' file", ex);
            }
        }
        try {
            this.gs.__parent__.ML.importModEx(script, asPrivate, this.__parent__, everything);
            return;
        } catch (ex) {
            alert(ex);
            delete this.loadedscripts[script];
            throw ex;
        }
    }
}

var ML = new MLP();
