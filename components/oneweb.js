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

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

var JSON = Components.classes["@mozilla.org/dom/json;1"].
    createInstance(Components.interfaces.nsIJSON);

function OneWebLoader() {
    this.wrappedJSObject = this;

}

OneWebLoader.prototype = {
    classDescription: "OneWeb Loader Service",
    classID: Components.ID("{205ce0f1-c4c8-4b6b-9d4e-8ba079a9512a}"),
    contractID: "@oneweb.im/loader;1",
	_xpcom_categories: [{category: "app-startup", service: true}],

    QueryInterface: XPCOMUtils.generateQI([
		Components.interfaces.nsISupports,
		Components.interfaces.nsIObserver]),

	observe: function(subject, topic, data) {
		var os = Components.classes["@mozilla.org/observer-service;1"].
			getService(Components.interfaces.nsIObserverService);

		if (topic == "app-startup") {
			os.addObserver(this, "final-ui-startup", false);
			os.addObserver(this, "quit-application", false);
		} else if (topic == "final-ui-startup") {
			uiUpdater.init();
		}
	}
};

function MLP() {
    this.loadedscripts = {};
    this.parents = [[this.__parent__, [], []]];

    this.loader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"].
        getService(Components.interfaces.mozIJSSubScriptLoader);
}

MLP.prototype =
{
    /**
     * List of paths to script handled by moduleloader.
     * @type Array<String>
     * @public
     */
    paths: ["chrome://oneweb/content/libs"],

    importModEx: function(script, asPrivate, scope, everything)
    {
        this.importMod(script, false, everything);

        var i, tmp = this.loadedscripts[script][0];

        for (i = 0; i < tmp.length; i++)
            if ((tmp2 = tmp[i].split(/\./)).length > 1) {
                var st = scope[tmp2[0]], ss = this.__parent__[tmp2[0]];
                for (var j = 1; j < tmp2.length-1; j++) {
                    ss = ss[tmp2[j]]
                    st = st[tmp2[j]]
                }
                st[tmp2[tmp2.length-1]] = ss[tmp2[tmp2.length-1]];
            } else
                scope[tmp[i]] = this.__parent__[tmp[i]];

        tmp = this.loadedscripts[script][1];

        for (i = 0; i < tmp.length; i++)
            if (tmp[i]) {
                var vars = tmp[i].split(/\.prototype\./);
                scope[vars[0]].prototype[vars[1]] =
                    this.__parent__[vars[0]].prototype[vars[1]];
            }
    },

    /**
     * Loads script. Throws exception if script can't be loaded.
     *
     * @tparam String script String with path to script. Script will be
     *  finded in all paths defined in paths property.
     * @tparam bool asPrivate If set to \em true all symbols from this
     *   script will be available only in current scope.
     * @tparam bool lazy If set to \em true this script should be loaded
     *   lazy, as late as possible.
     *
     * @public
     */
    importMod: function(script, asPrivate, everything)
    {
        var i, ex;

        if (this.loadedscripts[script]) {
//dump("+ + + + + + + + + + + + + + + + +".substr(0,2*this.parents.length)+script+"(C)\n");
            this.parents[this.parents.length-1][1] =
                this.parents[this.parents.length-1][1].
                concat(this.loadedscripts[script][0]);
            this.parents[this.parents.length-1][2] =
                this.parents[this.parents.length-1][2].
                concat(this.loadedscripts[script][1]);

            return Components.results.NS_OK;
        }
//dump("+ + + + + + + + + + + + + + + + +".substr(0,2*this.parents.length)+script+"\n");

    	var scope = { };
        this.parents.push([scope, [], []]);

        for (i = 0; i < this.paths.length; i++) {
            try {
                this.loadedscripts[script] = 1;
                this.loader.loadSubScript(this.paths[i]+"/"+script, scope);

                if (everything) {
                    dump("// "+script+"\nvar EXPORTED_SYMBOLS=[");
                    dump(['"'+i+'"' for (i in scope)].join(", "));
                    dump("];\n\n");
                }


                this.copySymbols(script, scope, asPrivate, everything);

                if (scope.INITIALIZE) {
                    scope.INITIALIZE();

                    if (scope.EXPORTED_SYMBOLS || everything)
                        this.copySymbols(script, scope, asPrivate, everything);
                }

                scope = this.parents.pop();
                if (!asPrivate) {
                    ex = scope[1].sort();
                    this.loadedscripts[script] = [[ex[0]], []];

                    for (i = 1; i < ex.length; i++)
                        if (ex[i] && ex[i-1] != ex[i])
                            this.loadedscripts[script][0].push(ex[i]);

                    Array.prototype.push.apply(this.
                            parents[this.parents.length-1][1],
                            this.loadedscripts[script][0]);
                    if (scope[2].length) {
                        ex = scope[2].sort();
                        this.loadedscripts[script][1].push(ex[0]);
                        for (i = 1; i < ex.length; i++) {
                            if (ex[i] && ex[i-1] != ex[i])
                                this.loadedscripts[script][1].push(ex[i]);
                        }

                        Array.prototype.push.apply(this.
                                parents[this.parents.length-1][2],
                                this.loadedscripts[script][1]);
                    }
                } else
                    delete this.loadedscripts[script];

                return Components.results.NS_OK;
            } catch (exc) {
                if (ex == null || typeof(ex)=="string")
                    ex = exc
                delete this.loadedscripts[script];
            }
        }
        this.parents.pop();

        var error = new Error("ML.importMod error: unable to import '"+script+"' file", ex);
        dump(error+"\n");
        //alert(error);
        throw error;
    },

    copySymbols: function(script, scope, asPrivate, everything)
    {
        var i, symbols;
        var parent = this.parents[0][0];

        if (everything) {
            symbols = scope.EXPORTED_SYMBOLS ? scope.EXPORTED_SYMBOLS.concat([]) : [];

            for (var i in scope)
                symbols.push(i);
        } else
            symbols = scope.EXPORTED_SYMBOLS;

        if (asPrivate)
            this.loadedscripts[script] = 0;

        if (symbols && symbols.length) {
            if (!asPrivate)
                Array.prototype.push.apply(this.
                        parents[this.parents.length-1][1], symbols);

            for (i = 0; i < symbols.length; i++)
                parent[symbols[i]] = scope[symbols[i]];
        }
    }
}

var ML = new MLP();

ML.importMod("exceptions.js");
ML.importMod("xpcom/compatibilityLayer.js")
ML.importMod("xpcom/utils.js")
ML.importMod("xpcom/browserUIUpdater.js")

function init(win) {
}

var components = [OneWebLoader];

function NSGetModule(compMgr, fileSpec) {
    return XPCOMUtils.generateModule(components);
}
