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

var EXPORTED_SYMBOLS = ["l10nFormatService", "_"];

ML.importMod("roles.js");

var l10nFormatService = {
    _formatStringCache: { },

    formatString: function(str)
    {
        if (this._formatStringCache[str])
            return this._formatStringCache[str].apply(this, arguments);

        var fun = this._formatStringCache[str] =
            new Function("", "return "+this._formatStringRec(str));

        return fun.apply(this, arguments);
    },

    _formatStringRec: function(str)
    {
        var templRE = /((?:[^\\{]|\\.)*?)\{\s*(\d+)((?:\s*,\s*(?:[^}{"',]*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'))*)\s*\}/g;
        var argsRE = /\s*,\s*(?:"((?:[^\\"]|\\.)*)"|'((?:[^\\']|\\.)*)'|([^'",\s]*))/g;

        var endPos = 0, args, res = "";
        var strParts, argsParts;
        while ((strParts = templRE.exec(str)))
        {
            endPos = templRE.lastIndex;
            templRE.lastIndex = 0;
            if (strParts[1])
                res += (res ? "+" : "")+uneval(unescapeJS(strParts[1]));

            args = [];
            while ((argsParts = argsRE.exec(strParts[3])))
                args.push(argsParts[3] ? argsParts[3] :
                        unescapeJS(argsParts[1]||argsParts[2]));

            if (args.length) {
                res += (res ? "+" : "")+"this._formatMethods."+
                    args[0]+"(arguments["+(+strParts[2]+1)+"]";
                for (var i = 1; i < args.length; i++)
                    res += ","+this._formatStringRec(args[i]);
                res += ")";
            } else
                res += (res ? "+" : "")+"arguments["+(+strParts[2]+1)+"]";
            templRE.lastIndex = endPos;
        }

        if (endPos < str.length)
            res += (res ? "+" : "")+uneval(unescapeJS(str.substr(endPos)));

        return res;
    },

    _formatMethods:
    {
        choice: function(value)
        {
            for (var i = 2; i < arguments.length; i+=2)
                if (value < arguments[i])
                    return arguments[i-1];
            return arguments[i-1];
        },

        bool: function(value, trueValue, falseValue)
        {
            return value ? trueValue : (falseValue || "");
        },

        number: function(n, length, pad, precison)
        {
            n = precison != null ? (+n).toFixed(precison) : (+n).toString();
            pad = pad || " ";
            while (n.length < length)
                n = pad+n;
            return n;
        },

        plurals: function(n)
        {
            if (!this._pluralsExpr)
                this._pluralsExpr = new Function("n",
                    "return arguments[1+("+_("$$plural_forms$$: n==1 ? 0 : 1")+")]");
            return this._pluralsExpr.apply(null, arguments);
        },

        upperCase: function(value)
        {
            return (""+value).toUpperCase();
        },

        lowerCase: function(value)
        {
            return (""+value).toLowerCase();
        },

        capitalize: function(value)
        {
            return (""+value).replace(/(^|\s+)(\S)(\S+)/g, function(a,s,w,r) {
                return s+w.toUpperCase()+r.toLowerCase()
            });
        }
    }
}

function _ (id) {
    if (id.search(/^p([A-Z][a-zA-Z]*)?\d*$/) != 0) {
        id = id.replace(/^\$\$\w+\$\$:\s*/, "");

        if (arguments.length == 1)
            return id;

        return l10nFormatService.formatString.apply(l10nFormatService, arguments);
    }

    if (!l10nFormatService._bundle) {
        var svc = Components.classes["@mozilla.org/intl/stringbundle;1"].
            getService(Components.interfaces.nsIStringBundleService);
        l10nFormatService._bundle = svc.
            createBundle("chrome://oneweb/locale/oneweb.properties");
    }
    id = l10nFormatService._bundle.GetStringFromName(id);

    if (arguments.length == 1)
        return id;

    return l10nFormatService.formatString.apply(l10nFormatService, arguments);
}

function _xml (id) {
    var args = [id.replace(/^\$\$\w+\$\$:(?:\s*)/, "")];
    for (var i = 1; i < arguments.length; i++)
        args[i] = xmlEscape(arguments[i]);
    return _.apply(null, args);
}
