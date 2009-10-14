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
