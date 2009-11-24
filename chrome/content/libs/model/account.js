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

var EXPORTED_SYMBOLS = ["account", "XULNS", "HTMLNS"];

ML.importMod("roles.js");
ML.importMod("3rdparty/jsjac/JSJaC.js");
ML.importMod("exceptions.js");
ML.importMod("l10n.js");
ML.importMod("modeltypes.js");
ML.importMod("disco.js");
ML.importMod("xmpptypes.js");
ML.importMod("cache.js");
ML.importMod("model/presence.js");
ML.importMod("model/roster.js");
ML.importMod("prefs.js");
ML.importMod("services/manager.js");
ML.importMod("services/adhoc.js");
ML.importMod("services/pep.js");
ML.importMod("services/bookmarksSharing.js");
ML.importMod("services/bookmarksSynchronising.js");

var XULNS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
var HTMLNS = "http://www.w3.org/1999/xhtml";

function Account()
{
    this._initialize();
    this.currentPresence = {show: "unavailable"};

    this.cache = new PersistentCache("onewebCache");
    this.events = [];
    this.globalMessages = [];
    this.connected = false;

    this.init();

    this.defaultGroup = new Group(null, _("Contacts"), true, -1);
    this.notInRosterGroup = new Group(null, _("Not in roster"), true, 1);
    this.otherResourcesGroup = new Group(null, _("My other resources"), true, -2);

    this.connectionInfo = {};
    this.myResource = new MyResource();

    this.permissions = {};

    prefManager.registerChangeCallback(new Callback(this.onPrefChange, this),
                                       "oneweb.connection", true);
    prefManager.registerChangeCallback(new Callback(this.onPrefChange, this),
                                       "oneweb.general", true);
    prefManager.registerChangeCallback(new Callback(this.onPrefChange, this),
                                       "oneweb.permissions", true);
    prefManager.registerChangeCallback(new Callback(this.onPrefChange, this),
                                       "oneweb.status", true);

    var lm = Components.classes["@mozilla.org/login-manager;1"].
        getService(Components.interfaces.nsILoginManager);

    this._setUser(this.connectionInfo.user);

    var host = this.connectionInfo.domain || this.connectionInfo.host;
    var user = this.connectionInfo.user;

    if (host && user) {
        var logins = lm.findLogins({}, "xmpp://"+host, null, host);
        if (logins.length) {
            this.connectionInfo.pass = logins[0].password;
            this.modelUpdated("connectionInfo");
        }
    }
    this.loginStateMsgToken = this.setGlobalMessage("loggetout", _("Logged Out"), 10);
}

_DECL_(Account, null, Model, DiscoItem).prototype =
{
    jsjacDebug: true,

    setPresence: function(show, status, priority, userSet)
    {
        var presence;
        if (show instanceof Object) {
            presence = show;
            userSet = userSet == null ? status : userSet;
        } else
            presence = new Presence(show, status, priority);

        if (this.currentPresence.show == "unavailable" && presence.show == "unavailable")
            return;

        account.connection.send(presence.generatePacket());

        for (var i = 0; i < this._presenceObservers.length; i++)
            this._presenceObservers[i]._sendPresence(presence);

        this.currentPresence = presence;
        if (userSet)
            this.userPresence = presence;

        this.modelUpdated("currentPresence");
    },

    groupsIterator: function(predicate, token)
    {
        for (var i = 0; i < this.groups.length; i++)
            if (!predicate || predicate(this.groups[i], token))
                yield (this.groups[i]);
    },

    contactsIterator: function(predicate, token)
    {
        for each (var contact in this.contacts)
            if (!predicate || predicate(contact, token))
                yield (contact);
    },

    _onGroupAdded: function(group)
    {
        this.groups.push(group);
        this.modelUpdated("groups", {added: [group]});
    },

    _onGroupRemoved: function(group)
    {
        this.groups.splice(this.groups.indexOf(group), 1);
        this.modelUpdated("groups", {removed: [group]});
    },

    _onContactAdded: function(contact)
    {
        this.contacts[contact.jid.normalizedJID] = contact;
        this.modelUpdated("contacts", {added: [contact]});
    },

    _onContactRemoved: function(contact)
    {
        delete this.contacts[contact.jid.normalizedJID];
        this.modelUpdated("contacts", {removed: [contact]});
    },

    getOrCreateGroup: function(name)
    {
        if (this.allGroups[name])
            return this.allGroups[name];
        return new Group(name);
    },

    getOrCreateContact: function(jid, showInRoster, name, groups)
    {
        jid = new JID(jid);
        var normalizedJID = jid.normalizedJID;

        if (this.allContacts[normalizedJID])
            return this.allContacts[normalizedJID];
        if (showInRoster) {
            var contact = new Contact(jid, name, [this.notInRosterGroup], null, null);
            contact.newItem = true;
            return contact;
        } else
            return new Contact(jid, name, groups, null, null, true);
    },

    getOrCreateResource: function(jid)
    {
        jid = new JID(jid);
        var normalizedJID = jid.normalizedJID;

        if (this.resources[normalizedJID])
            return this.resources[normalizedJID];

        if (normalizedJID.shortJID == this.myJID.normalizedJID.shortJID)
            if (normalizedJID == this.myJID.normalizedJID)
                return null;
            else
                return (new MyResourcesContact(jid)).createResource(jid);

        if (this.allContacts[normalizedJID.shortJID])
            return this.allContacts[normalizedJID.shortJID].createResource(jid);

        return null;
    },

    getContactOrResource: function(jid) {
        jid = new JID(jid);

        if (this.allContacts[jid.normalizedJID])
            return this.allContacts[jid.normalizedJID];
        if (this.myResource.jid && this.myResource.jid.normalizedJID == jid.normalizedJID)
            return this.myResource;
        return this.resources[jid.normalizedJID];
    },

    getContactOrResourceName: function(jid, showResource) {
        jid = new JID(jid);

        if (!showResource)
            jid = jid.shortJIDObject;

        var name = this.getContactOrResource(jid);
        if (!name && this.myResource.jid.normalizedJID.shortJID == jid.normalizedJID.shortJID)
            return account.myResource.visibleName;

        return name ? name.visibleName : jid.toUserString();
    },

    getActiveResource: function(jid) {
        jid = new JID(jid);

        if (this.allContacts[jid.normalizedJID])
            return this.allContacts[jid.normalizedJID].activeResource;
        if (this.resources[jid.normalizedJID])
            this.resources[jid.normalizedJID].contact.activeResource;
        return null;
    },

    showPrefs: function()
    {
        openDialogUniq("ow:preferences", "chrome://oneweb/content/preferences.xul",
                       "chrome,centerscreen");
    },

    _setUser: function(user, restore) {
        if (user && ~user.search(/@/)) {
            var jid = new JID(user);
            this.connectionInfo.host = jid.domain;
            this.connectionInfo.domain = null;
            this.connectionInfo.user = jid.node;
        } else {
            this.connectionInfo.user = user;
            if (restore) {
                this.connectionInfo.host = prefManager.getPref("oneweb.connection.host");
                this.connectionInfo.domain = prefManager.getPref("oneweb.connection.domain");
            }
        }
    },

    onPrefChange: function(name, value)
    {
        var namePart;
        if ((namePart = name.replace(/^oneweb\.connection\./, "")) != name) {
            if (namePart != "host" && namePart != "base" && namePart != "user" &&
                namePart != "port" && namePart != "type" && namePart != "domain")
                return;

            this.connectionInfo[namePart] = value;

            if (namePart == "user")
                this._setUser(value, true);

            if ((namePart == "domain" || namePart == "host" || namePart == "user") &&
                !this.connected)
            {
                var host = this.connectionInfo.domain || this.connectionInfo.host;
                this.myJID =host && this.connectionInfo.user ?
                    new JID(this.connectionInfo.user, host) : null;
            }
            this.modelUpdated("connectionInfo");
        } else if ((namePart = name.replace(/^oneweb\.permissions\./, "")) != name) {
            this.permissions[namePart] = value;
        }
    },

    _uniqEventId: 0,

    setGlobalMessage: function(type, message, priority, timeout)
    {
        var token = {type: type, message: message, priority: priority};

        for (var i = 0; i < this.globalMessages.length; i++)
            if (this.globalMessages[i].priority < priority)
                break;

        this.globalMessages.splice(i, 0, token);

        if (timeout)
            setTimeout(function(token) {
                account.resetGlobalMessage(token)
            }, timeout, token);

        if (i > 0)
            return token;

        this.globalMessage = token;
        this.modelUpdated("globalMessage", token);

        return token;
    },

    resetGlobalMessage: function(token)
    {
        var idx = this.globalMessages.indexOf(token);
        if (idx < 0)
            return;

        this.globalMessages.splice(idx, 1);

        if (idx > 0)
            return;

        this.globalMessage = this.globalMessages[0];
        this.modelUpdated("globalMessage", this.globalMessage);
    },

    addEvent: function(content, callback, key)
    {
        if (!key)
            key = "autogen"+(++this._uniqEventId);

        var token = [content, callback, key];
        content.token = token;
        content.key = key;

        this.events.push(token);
        this.modelUpdated("events", {added: [token]});

        return key;
    },

    removeEvent: function(token)
    {
        var idx = this.events.indexOf(token);
        if (idx >= 0) {
            this.events.splice(idx, 1);
            this.modelUpdated("events", {removed: [token]});
        }
    },

    removeEventsByKey: function()
    {
        var keys = {}
        for (var i = 0; i < arguments.length; i++)
            keys[arguments[i]] = 1;

        var removed = [];
        for (var i = this.events.length-1; i >= 0; i--)
            if (this.events[i][2] in keys) {
                removed.push(this.events[i]);
                this.events.splice(i, 1);
            }
        if (removed.length)
            this.modelUpdated("events", {removed: removed});
    },

    setUserAndPass: function(user, pass, savePass)
    {
        prefManager.setPref("oneweb.connection.user", user);

        this._setUser(user, true);

        var lm = Components.classes["@mozilla.org/login-manager;1"].
            getService(Components.interfaces.nsILoginManager);

        var host = this.connectionInfo.domain || this.connectionInfo.host;

        var logins = lm.findLogins({}, "xmpp://"+host, null, host);
        for (var i = 0; i < logins.length; i++)
            lm.removeLogin(logins[i]);

        if (savePass) {
            var li = Components.classes["@mozilla.org/login-manager/loginInfo;1"].
                createInstance(Components.interfaces.nsILoginInfo);

            li.init("xmpp://"+host, null, host, this.connectionInfo.user,
                    pass, "", "");
            lm.addLogin(li);
        }

        this.connectionInfo.pass = pass;
        this.modelUpdated("connectionInfo");
    },

    connect: function()
    {
        var domain = this.connectionInfo.domain || this.connectionInfo.host;
        var httpbase = "http://"+this.connectionInfo.host+":"+
            this.connectionInfo.port+"/"+this.connectionInfo.base+"/";

        var args = {
            httpbase: httpbase,
            oDbg: {log: function(a) {
                if (!account.jsjacDebug)
                    return
                account.console ? account.console.info(a) : dump(a+"\n")
            }},
            timerval: 2000};

        switch (this.connectionInfo.type) {
            case "native":
                account.connection = new JSJaCMozillaConnection(args);
                break;
            case "http-bind":
                account.connection = new JSJaCHttpBindingConnection(args);
                break;
            default:
                account.connection = new JSJaCHttpPollingConnection(args);
        }

        account.connection.registerHandler("message", function(p){account.onMessage(p)});
        account.connection.registerHandler("presence", function(p){account.onPresence(p)});
        account.connection.registerHandler("iq", function(p){account.onIQ(p)});
        account.connection.registerHandler("onconnect", function(p){account.onConnect(p)});
        account.connection.registerHandler("ondisconnect", function(p){account.onDisconnect(p)});
        account.connection.registerHandler("onerror", function(p){account.onError(p)});
        account.connection.registerHandler("status_changed", function(p){account.onStatusChanged(p)});

        if (this.connectionInfo.user)
            args = {
                domain: domain,
                username: this.connectionInfo.user,
                pass: this.connectionInfo.pass,
                resource: prefManager.getPref("oneweb.connection.resource")+"-"+
                    generateRandomName(6)
            }
        else
            args = {
                domain: domain,
                authtype: "saslanon",
                resource: prefManager.getPref("oneweb.connection.resource")+"-"+
                    generateRandomName(6)
            }

        this.resetGlobalMessage(this.loginStateMsgToken);
        this.loginStateMsgToken = this.setGlobalMessage("loggin", _("Logging In"), 100);

        this.modelUpdated("account.connection");
        account.connection.connect(args);
    },

    disconnect: function()
    {
        account.connection.disconnect();
    },

    onConnect: function()
    {
        var pkt = new JSJaCIQ();
        pkt.setIQ(null, 'get');
        pkt.setQuery('jabber:iq:roster');
        account.connection.send(pkt, this._initialRosterFetch, this);

        this.connected = true;
        this.connectedAt = new Date();

        this.myJID = new JID(account.connection.fulljid);
        this.jid = new JID(this.myJID.domain);

        this.modelUpdated("connected");

        this.resetGlobalMessage(this.loginStateMsgToken);
        this.loginStateMsgToken = this.setGlobalMessage("loggedin", _("OneWeb"), 10);
    },

    _initConnectionStep: function(flags) {
        if (this._initConnectionState == 1)
            return;

        this._initConnectionState |= flags;

        if (this._initConnectionState != 1)
            return;

        this.setPresence(new Presence(null, null, -1), true);
        this.connectionInitialized = true;
        this.modelUpdated("connectionInitialized");
    },

    _initialRosterFetch: function(pkt, _this)
    {
        if (pkt)
            _this.onIQ(pkt);

        _this._initConnectionStep(1);
    },

    _initialize: function()
    {
        this.groups = [];
        this.allGroups = {};
        this.contacts = {};
        this.allContacts = {};
        this.resources = {};
        this.myResources = {};
        this._presenceObservers = [];
        this._initConnectionState = 0;
    },

    onDisconnect: function()
    {
        this.resetGlobalMessage(this.loginStateMsgToken);

        // If "disconnect" event is received before "connect", it
        // means that we attempted connection but did not manage
        // to.
        if(!this.connected)
            this.loginStateMsgToken = this.setGlobalMessage("logginError", _("Loggin Error"), 300);
        else
            this.loginStateMsgToken = this.setGlobalMessage("loggetout", _("Logged Out"), 10);

        this.connected = false;
        this.connectionInitialized = false;
        account.connection = null;

        this.modelUpdated("account.connection");
        this.modelUpdated("connected");
        this.modelUpdated("connectionInitialized");

        var groups = this.groups;

        this._initialize();

        this.modelUpdated("groups", {removed: groups});

        servicesManager._clean();

        cleanDiscoCache();

        for (var i = 0; i < groups.length; i++)
            if (groups[i].builtinGroup)
                groups[i]._clean();
    },

    onPresence: function(packet)
    {
        var sender = new JID(packet.getFrom());

        //Handle subscription requests
        switch (packet.getType()) {
        case "subscribe":
        case "subscribed":
        case "unsubscribe":
        case "unsubscribed":
            return;
        case "unavailable":
            if (!this.resources[sender.normalizedJID])
                return;
        }

        // Delegate rest to respective handlers

        var item = sender.resource ? this.getOrCreateResource(sender) :
            this.getOrCreateResource(sender);

        if (item)
            item.onPresence(packet);
    },

    onIQ: function(packet)
    {
        var query = packet.getNode().childNodes;

        for (var i = 0; i < query.length; i++)
            if (query[i].nodeType == 1) {
                query = query[i];
                break;
            }
        if (!query.nodeType)
            return;

        if (query.namespaceURI != "jabber:iq:roster") {
            servicesManager.dispatchIQ(packet, query);
            return;
        }

        var items = query.getElementsByTagNameNS("jabber:iq:roster", "item");
        for (i = 0; i < items.length; i++) {
            var jid = items[i].getAttribute("jid");
            var normalizedJID = new JID(jid).normalizedJID;

            if (this.allContacts[normalizedJID]) {
                var contact = this.allContacts[normalizedJID];
                contact._updateFromServer(items[i]);

                if (contact._subscribed && contact.canSeeHim) {
                    contact.allowToSeeMe();
                    delete contact._subscribed;
                }
            } else
                new Contact(items[i]);
        }
    },

    onMessage: function(packet)
    {
        var sender = new JID(packet.getFrom());

        // Message come from me
        if (sender.normalizedJID == this.myJID.normalizedJID)
            return;

        servicesManager.dispatchMessage(packet, sender);
    },

    onStatusChanged: function(error) {
        switch(error) {
            case 'session-terminate-conflict':
            report('user', 'error', 'Conflict (same account/resource signed in from another client)');
            break;
        }
    },

    onError: function(error)
    {
        if (!this.connected) {
            //report('user', 'error', 'Invalid response from server (server down or misconfigured)');

            // Hack to preven error message in onDisconnect
            this.connected = true;
            this.onDisconnect();
        }
        report("developer", "error", error, this);
    }
}

var account = new Account();

//account.showConsole();
