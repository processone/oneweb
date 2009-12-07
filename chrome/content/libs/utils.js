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

var EXPORTED_SYMBOLS = ["E4XtoDOM", "DOMtoE4X", "ppFileSize", "ppTimeInterval",
                        "linkEventsRedirector", "openDialogUniq", "openLink",
                        "pickFile", "closeAllWindows", "StorageWrapper",
                        "Callback", "CallbacksList", "RegistrationToken",
                        "Comparator", "NotificationsCanceler", "xmlEscape",
                        "unescapeJS", "generateRandomName", "generateUniqueId",
                        "recoverSetters", "perlSplit", "report", "compareArrays"];

ML.importMod("roles.js");

function E4XtoDOM(xml, targetDoc)
{
    var dp = new DOMParser(null, null, null);
    var el = dp.parseFromString("<x>"+xml.toXMLString()+"</x>", "text/xml").documentElement;
    var els = el.childNodes;

    // adoptNode throws exception on gecko 1.8
    if (els.length == 1)
        try {
            return targetDoc ? targetDoc.importNode(els[0],true) : els[0];
        } catch (ex) {
            return els[0];
        }

    var fragment = targetDoc ? targetDoc.createDocumentFragment() :
        el.ownerDocument.createDocumentFragment();

    for (var i = 0; i < els.length; i++)
        try {
            fragment.appendChild(targetDoc ? targetDoc.adoptNode(els[i]) : els[i]);
        } catch (ex) {
            fragment.appendChild(els[i]);
        }

    return fragment;
}

function DOMtoE4X(dom)
{
    var xs = new XMLSerializer();
    return new XML(xs.serializeToString(dom));
}

function linkEventsRedirector(event)
{
    if (event.target.localName.toLowerCase() != "a" || event.type != "click" ||
        event.button != 0 && event.button != 1)
        return;

    event.preventDefault();
    event.stopPropagation();

    openLink(event.target.href);
}

function openDialogUniq(type, url, flags)
{
    var win;

    if (type) {
        var wmediator = Components.classes["@mozilla.org/appshell/window-mediator;1"].
            getService(Components.interfaces.nsIWindowMediator);
        win = wmediator.getMostRecentWindow(type);
    }

    if (!win) {
        var args = [url, "_blank"].concat(Array.slice(arguments, 2));
        return window.openDialog.apply(window, args);
    }

    win.focus();
    return win;
}

function openLink(uri)
{
    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"].
        getService(Components.interfaces.nsIWindowMediator);
    browser = wm.getMostRecentWindow("navigator:browser");

    if (browser) {
        if (browser.Browser)
            return browser.Browser.addTab(uri, true).browser;
        else
            return browser.getBrowser().addTab(uri, null, null).linkedBrowser;

        return false;
    }

    return open(uri, "_blank");
}

function pickFile(title, forSave, filters, path, win)
{
    var filtersMask;
    var picker = Components.classes["@mozilla.org/filepicker;1"].
        createInstance(Components.interfaces.nsIFilePicker);

    if (!win)
        win = findCallerWindow();

    picker.init(win, title, forSave ? picker.modeSave : picker.modeOpen);

    if (filters) {
        filters = filters.split(/\s*,\s*/);
        for (var i = 0; i < filters.length; i++) {
            var f = "filter" + filters[i][0].toUpperCase() + filters[i].substr(1);
            if (f in picker)
                filtersMask |= picker[f];
        }
        if (filtersMask)
            picker.appendFilters(filtersMask);
    }

    if (path) {
        try {
            var file = Components.classes["@mozilla.org/file/local;1"].
                createInstance(Components.interfaces.nsILocalFile);
            file.initWithPath(path);

            if (file.exists() && file.isDirectory())
                picker.displayDirectory = file;
            else {
                picker.displayDirectory = file.parent;
                picker.defaultString = file.leafName;
            }
        } catch(ex) {
            picker.defaultString = path;
        }
    }

    return picker.show() != picker.returnCancel ? picker.file.path : null;
}

function Callback(fun, obj) {
    if (fun._isaCallback) {
        fun._consArgs = arguments.callee.caller ? arguments.callee.caller.arguments : [];
        return fun;
    }

    var cb = new Function("", "return arguments.callee.apply(this, arguments)");
    cb.apply = function(_this, _args) {
        delete this._consArgs;
        var args = this._args.slice();

        this._callArgs = this._callArgs ? this._callArgs.length == 0 ?
            [[0,0,Infinity]] : this._callArgs : [];

        for (var i = this._callArgs.length-1; i >= 0; i--) {
            var a = Array.slice(_args, this._callArgs[i][1], this._callArgs[i][2]);
            a.unshift(this._callArgs[i][0], 0);
            args.splice.apply(args, a);
        }
        return this._fun.apply(this._obj, args);
    }
    cb._fun = fun;
    cb._obj = obj;
    cb._args = [];
    cb._consArgs = arguments.callee.caller ? arguments.callee.caller.arguments : [];
    cb._callArgs = [];
    cb._isaCallback = true;
    cb.addArgs = function() { this._args.push.apply(this._args, arguments); return this; };
    cb.fromCons = function(start, stop) {
        this._args.push.apply(this._args, Array.slice(this._consArgs, start,
                                                      stop == null ? Infinity : stop));
        return this;
    };
    cb.fromCall = function(start, stop) {
        if (!this._callArgs || start < 0) {
            delete this._callArgs;
            return this;
        }
        this._callArgs.push([this._args.length,  start || 0, stop == null ? Infinity : stop]);
        return this;
    };
    return cb;
}

function CallbacksList(hasMultipleContexts)
{
    if (hasMultipleContexts)
        this._callbacks = {}
    else
        this._callbacks = [];
}

_DECL_(CallbacksList).prototype =
{
    _traces: [],
    _traceCallbacks: [],
    trace: false,

    _iterateCallbacks: function()
    {
        var callbacks;

        if (this._callbacks instanceof Array)
            callbacks = this._callbacks;
        else {
            callbacks = this._callbacks[""] || [];
            for (var i = 0; i < arguments.length; i++)
                callbacks = callbacks.concat(this._callbacks[arguments[i]] || []);
        }
        for (i = 0; i < callbacks.length; i++)
            yield (callbacks[i]);
    },

    _registerCallback: function(callback, token)
    {
        if (this.trace) {
            this._traceCallbacks.push(callback);
            this._traces.push([this.constructor.name+"."+arguments[2],
                               dumpStack(null, null, 2)]);
        }
        if (this._callbacks instanceof Array)
            this._callbacks.push(callback);
        else {
            var contexts = arguments.length > 2 ? Array.slice(arguments, 2) : [""];
            for (var i = 0; i < contexts.length; i++)
                if (!this._callbacks[contexts[i]])
                    this._callbacks[contexts[i]] = [callback];
                else
                    this._callbacks[contexts[i]].push(callback);
        }

        if (!token)
            token = new RegistrationToken();
        token._addRegistrationInfo(this, callback);

        return token;
    },

    _unregisterCallback: function(callback)
    {
        var idx;

        if (this.trace) {
            idx = this._traceCallbacks.indexOf(callback);
            if (idx >= 0) {
                this._traceCallbacks.splice(idx, 1);
                this._traces.splice(idx, 1);
            }
        }

        if (this._callbacks instanceof Array) {
            if ((idx = this._callbacks.indexOf(callback)) >= 0) {
                if (this._callbacks[idx] && this._callbacks[idx].__unregister_handler)
                    this._callbacks[idx].__unregister_handler();
                this._callbacks.splice(idx, 1);
            }
        } else
            for each (var context in this._callbacks)
                if ((idx = context.indexOf(callback)) >= 0) {
                    if (context[idx] && context[idx].__unregister_handler)
                        context[idx].__unregister_handler();
                    context.splice(idx, 1);
                }
    },

    _hasCallbacks: function(name)
    {
        if (this._callbacks instanceof Array)
            return this._callbacks.length > 0;
        return this._callbacks[name] && this._callbacks[name].length > 0;
    },
}

function RegistrationToken()
{
    this._regs = [];
    this._tokens = [];
}

_DECL_(RegistrationToken).prototype =
{
    _addRegistrationInfo: function(listener, callback)
    {
        this._regs.push([listener, callback]);
    },

    merge: function(token)
    {
        this._tokens.push(token);
    },

    unmerge: function(token)
    {
        var idx = this._tokens.indexOf(token)
        if (idx >= 0)
            this._tokens.splice(1, 0);
    },

    unregisterFromAll: function()
    {
        for (var i = this._regs.length-1; i >= 0; i--)
            this._regs[i][0]._unregisterCallback(this._regs[i][1]);
        for (var i = this._tokens.length-1; i >= 0; i--)
            this._tokens[i].unregisterFromAll();
        this._regs = [];
    },

    unregister: function(listener)
    {
        for (var i = this._regs.length-1; i >= 0; i--)
            if (this._regs[i][0] == listener) {
                this._regs[i][0]._unregisterCallback(this._regs[i][1]);
                this._regs.splice(i, 1);
            }
        for (var i = this._tokens.length-1; i >= 0; i--)
            this._tokens[i].unregister(listener);
    },

    _dumpStats: function(indent)
    {
        var res = ""
        indent = indent || "";
        res += indent + this._regs.length+"\n";
        for (var i = 0; i < this._tokens.length; i++)
            res += this._tokens[i]._dumpStats(indent+"  ");
        if (!indent)
            alert(res);
        return res;
    }
}

function Comparator()
{
}

_DECL_(Comparator).prototype =
{
    ROLE_REQUIRES: [ ["cmp", "isGt", "isLt"] ],

    isEq: function(obj, arg)
    {
        return this.cmp(obj, arg) == 0;
    },

    isGt: function(obj, arg)
    {
        return this.cmp(obj, arg) < 0;
    },

    isLt: function(obj, arg)
    {
        return obj.isGt(this, arg);
    },

    cmp: function(obj, arg)
    {
        if (this.isLt(obj, arg))
            return 1;
        if (obj.isLt(this, arg))
            return -1;
        return 0;
    }
}

function NotificationsCanceler()
{
    this.notifications = [];
}
_DECL_(NotificationsCanceler).prototype =
{
    set add(val) {
        if (!this.notifications)
            this.notifications = [val];
        else
            this.notifications.push(val)
    },

    cancel: function() {
        if (!this.notifications)
            return false;

        for (var i = 0; i < this.notifications.length; i++)
            if (typeof(this.notifications[i].cancel) == "function")
                this.notifications[i].cancel()
            else
                account.removeEventsByKey(this.notifications[i]);
        this.notifications = null;

        return true;
    }
}

function xmlEscape(str)
{
    if (str == null)
        return "";
    return str.toString().
        replace(/&/g,"&amp;").
        replace(/</g,"&lt;").
        replace(/>/g,"&gt;").
        replace(/\'/g,"&apos;").
        replace(/\"/g,"&quot;");
}

function unescapeJS(str)
{
    if (str == null)
        return "";
    return str.toString().replace(/\\(?:u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|([0-7]{1,3})|(n)|(r)|(t)|(.)|$)/g,
        function(r, uni, hex, oct, nl, cr, tab, chr)
        {
            var charCode = parseInt(uni || hex, 16) || parseInt(oct, 8);
            if (charCode) return String.fromCharCode(charCode);
            if (nl) return "\n";
            if (cr) return "\r";
            if (tab) return "\t";
            return chr||"";
        });
}

function recoverSetters(obj, debug) {
    var p = obj.__proto__;
    var state = {};

    obj.__proto__ = {};

    for (var i in obj) {
        if (!p.__lookupSetter__(i))
            continue;

        state[i] = obj[i];
        delete obj[i];
    }

    obj.__proto__ = p;

    for (i in state)
        obj[i] = state[i];
}

function generateRandomName(length)
{
    const charset = "0123456789abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz";
    var name = "";
    for (var i = 0; i < length; ++i)
        name += charset.charAt(Math.floor(Math.random() * charset.length));
    return name;
}

function generateUniqueId()
{
    return "uid"+(arguments.callee.value = arguments.callee.value+1 || 0);
}

function perlSplit(str, split, limit) {
    if (limit == null || limit <= 0)
        return str.split(split, limit);

    var res = [];
    var idx = 0;
    if (typeof(split) == "string") {
        for (; limit > 1; limit--) {
            var nidx = str.indexOf(split, idx);
            if (nidx < 0)
                break;
            res.push(str.substring(idx, nidx));
            idx = nidx += split.length;
        }
        res.push(str.substring(idx));
    } else {
        var rx = new RegExp(split.source, "g"), s;
        for (; limit > 1 && (s = rx(str)); limit--) {
            res.push(str.substring(idx, rx.lastIndex - s[0].length));
            idx = rx.lastIndex;
        }
        res.push(str.substring(idx));
    }
    return res;
}

function report(to, level, info, context)
{
}

function compareArrays(a, b) {
    a=a.sort();
    b=b.sort();

    var inA = [], inBoth = [], inB = [];
    var ai = 0; bi = 0;

    while (ai < a.length || bi < b.length) {
        if (bi >= b.length || a[ai] < b[bi])
            inA.push(a[ai++]);
        else if (ai >= a.length || a[ai] > b[bi])
            inB.push(b[bi++]);
        else {
            inBoth.push(a[ai++]);
            bi++;
        }
    }
    return [inA, inBoth, inB];
}
