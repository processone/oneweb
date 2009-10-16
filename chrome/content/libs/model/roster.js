var EXPORTED_SYMBOLS = ["Group", "Contact", "Resource", "MyResourcesContact",
                        "MyResource"];

ML.importMod("roles.js");
ML.importMod("utils.js");
ML.importMod("modeltypes.js");

function Group(name, visibleName, builtinGroup, sortPriority)
{
    this.name = name;
    this.visibleName = visibleName || name || "XXXunnamed";
    this.contacts = [];
    this.availContacts = 0;
    this.builtinGroup = builtinGroup;
    this.sortPriority = sortPriority || 0;

    if (!builtinGroup)
        account.allGroups[name] = this;

    this.init();
}

_DECL_(Group, null, Model).prototype =
{
    contactsIterator: function(predicate)
    {
        for (var i = 0; i < this.contacts.length; i++)
            if (!predicate || predicate(this.contacts[i]))
                yield (this.contacts[i]);
    },

    _clean: function()
    {
        this.contacts = [];
        this.availContacts = 0;
        this.init();
    },

    _onContactUpdated: function(contact, dontNotifyViews)
    {
        var oldAvailCount = this.availContacts;
        this.availContacts = 0;

        for (var c in this.contactsIterator())
            if (c.activeResource)
                this.availContacts++;

        if (!dontNotifyViews && oldAvailCount != this.availContacts)
            this.modelUpdated("availContacts");
        return oldAvailCount != this.availContacts;
    },

    _onContactAdded: function(contact)
    {
        this.contacts.push(contact);
        if (contact.activeResource) {
            this.availContacts++;
            this.modelUpdated("contacts", {added: [contact]});
            this.modelUpdated("availContacts");
        } else
            this.modelUpdated("contacts", {added: [contact]});
        if (this.contacts.length == 1)
            account._onGroupAdded(this);
    },

    _onContactRemoved: function(contact)
    {
        this.contacts.splice(this.contacts.indexOf(contact), 1);
        if (this._onContactUpdated(contact, true)) {
            this.modelUpdated("contacts", {removed: [contact]})
            this.modelUpdated("availContacts");
        } else
            this.modelUpdated("contacts", {removed: [contact]});

        if (this.contacts.length == 0) {
            account._onGroupRemoved(this);
            if (!this.builtinGroup)
                delete account.allGroups[this.name];
        }
    }
}

function Contact(jid, name, groups, subscription, subscriptionAsk, newItem)
{
    this.init();

    if (jid instanceof Node)
        [jid, name, subscription, subscriptionAsk, groups] = this._parseNode(jid);

    this.jid = new JID(jid);
    this.resources = [];
    if (newItem) {
        this._name = name;
        this._groups = groups || [];
        this.newItem = true;
        this.groups = [];
        this.visibleName = name || this.jid.toUserString("short");
    } else {
        this.name = name || this.jid.toUserString("short");
        this.visibleName = name || this.jid.toUserString("short");
        this.subscription = subscription || "none";
        this.subscriptionAsk = !!subscriptionAsk;

        groups = groups || [account.defaultGroup];
        this.groups = [];
        for (var i = 0; i < groups.length; i++) {
            var group = typeof(groups[i]) == "string" ?
                account.getOrCreateGroup(groups[i]) : groups[i];
            this.groups.push(group);
            group._onContactAdded(this);
        }

        this.newItem = false;
        account._onContactAdded(this);
    }

    account.allContacts[this.jid.normalizedJID] = this;
}

_DECL_(Contact, null, Model, Comparator, DiscoItem).prototype =
{
    get canSeeMe() {
        return this.subscription == "both" || this.subscription == "from";
    },

    get canSeeHim() {
      return this.subscription == "both" || this.subscription == "to";
    },

    get presence() {
        return this.activeResource ? this.activeResource.presence :
            new Presence("unavailable");
    },

    get serialized() {
        return {
            jid: this.jid.toString(),
            normalizedJID: this.jid.normalizedJID.toString(),
            name: this.visibleName,
            subscription: this.subscription,
            subscriptionAsk: this.subscriptionAsk,
            presence: this.presence.serialized
        };
    },

    _updateRoster: function(callback)
    {
        var iq = new JSJaCIQ();
        iq.setType('set');
        var query = iq.setQuery('jabber:iq:roster');
        var item = query.appendChild(iq.getDoc().createElement('item'));
        item.setAttribute('jid', this.jid);

        if (this._subscription != "remove") {
            if (this._name || this.name)
                item.setAttribute('name', this._name || this.name);
            var groups = this._groups || this.groups;
            for (var i = 0; i < groups.length; i++) {
                var groupName = typeof(groups[i]) == "string" ? groups[i] : groups[i]._name || groups[i].name;
                if (!groupName) continue;
                var group = item.appendChild(iq.getDoc().createElement('group'));
                group.appendChild(iq.getDoc().createTextNode(groupName));
            }
            this._inRoster = true;
        } else
            this._inRoster = false;

        if (this._subscription || this.subscription)
            item.setAttribute('subscription', this._subscription || this.subscription);

        delete this._name;
        delete this._subscription;
        delete this._subscriptionAsk;
        delete this._groups;

        account.connection.send(iq, callback);
    },

    _updateFromServer: function(node)
    {
        var groups, groupsHash;
        var canSeeHim = this.canSeeHim;

        var oldState = { name: this.name, subscription: this.subscription,
            subscriptionAsk: this.subscriptionAsk, visibleName: this.visibleName};

        [,this.name, this.subscription, this.subscriptionAsk, groups, groupsHash] =
            this._parseNode(node, true);

        this.name = this.name || this.jid.toString("short");
        this.visibleName = this.name;
        delete this._inRoster;

        for (var i = 0; i < this.groups.length; i++) {
            if (!(this.groups[i].name in groupsHash)) {
                if (!this._notVisibleInRoster)
                    this.groups[i]._onContactRemoved(this);
                oldState.groups = 1;
            }
            delete groupsHash[this.groups[i].name];
        }

        for (i in groupsHash) {
            if (!this._notVisibleInRoster)
                groupsHash[i]._onContactAdded(this);
            oldState.groups = 1;
        }

        this.groups = groups;

        if (this.subscription == "remove") {
            account._onContactRemoved(this);
            delete account.allContacts[this.jid.normalizedJID]
            this.newItem = true;
            this.modelUpdated("newItem");
        } else if (this.newItem) {
            account._onContactAdded(this);
            this.newItem = false;
            this.modelUpdated("newItem");
        }

        if (this.subscription == "remove" || (canSeeHim && !this.canSeeHim)) {
            for (i = 0; i < this.resources.length; i++)
                this.resources[i]._remove();
        }

        // Notify our resources views about visibleName change here, because
        //  resources don't track that.
        if (this._modelUpdatedCheck(oldState).indexOf("visibleName") >= 0)
            for (i = 0; i < this.resources.length; i++)
                this.resources[i].modelUpdated("visibleName");
    },

    _parseNode: function(node, wantGroupsHash)
    {
        jid = node.getAttribute("jid");
        name = node.getAttribute("name");
        subscription = node.getAttribute("subscription") || "none"
        subscriptionAsk = node.getAttribute("ask") == "susbscribe";

        groups = [];
        groupsHash = {};
        var groupTags = node.getElementsByTagName("group");
        for (var i = 0; i < groupTags.length; i++) {
            var groupName = groupTags[i].textContent;
            var group = account.getOrCreateGroup(groupName);
            groups.push(group);
            groupsHash[groupName] = group;
        }

        if (groups.length == 0 && subscription != "remove") {
            groups.push(account.defaultGroup);
            groupsHash[""] = account.defaultGroup;
        }
        return [jid, name, subscription, subscriptionAsk, groups, groupsHash];
    },

    _sendPresence: function(presence)
    {
        if (account.connection)
            account.connection.send(presence.generatePacket(this));
    },

    groupsIterator: function(predicate, token)
    {
        for (var i = 0; i < this.groups.length; i++)
            if (!predicate || predicate(this.groups[i], token))
                yield (this.groups[i]);
    },

    resourcesIterator: function(predicate, token)
    {
        for (var i = 0; i < this.resources.length; i++)
            if (!predicate || predicate(this.resources[i], token))
                yield (this.resources[i]);
    },

    createResource: function(jid)
    {
        return new Resource(jid, this);
    },

    onAdHocCommand: function()
    {
        if (this.activeResource)
            this.activeResource.onAdHocCommand();
    },

    _onResourceUpdated: function(resource, dontNotifyViews)
    {
        if (!this.resources.length)
            return false;

        var res = this.activeResource;

        if (resource == this.activeResource) {
            res = this.resources[0];

            for (var r in this.resourcesIterator())
                if (res.isLt(r))
                    res = r;
        } else if (!this.activeResource || this.activeResource.isLt(resource))
            res = resource;

        if (res != this.activeResource) {
            this.activeResource = res;
            if (!dontNotifyViews) {
                this.modelUpdated("activeResource");
                this.modelUpdated("presence");
            }
            return true;
        } else if (!dontNotifyViews && resource == this.activeResource)
            this.modelUpdated("presence");

        return false;
    },

    _onResourceAdded: function(resource)
    {
        var notifyGroups = !this.activeResource;

        this.resources.push(resource);
        if (!this.activeResource || this.activeResource.isLt(resource)) {
            this.activeResource = resource;
            this.modelUpdated("resources", {added: [resource]});
            account.modelUpdated("resources", {added: [resource]});
            this.modelUpdated("activeResource");
            this.modelUpdated("presence");
        } else {
            this.modelUpdated("resources", {added: [resource]});
            account.modelUpdated("resources", {added: [resource]});
        }
        if (notifyGroups && !this._notVisibleInRoster)
            for (var g in this.groupsIterator())
                g._onContactUpdated(this);
    },

    _onResourceRemoved: function(resource)
    {
        this.resources.splice(this.resources.indexOf(resource), 1);
        if (!this.resources.length) {
            this.activeResource = null;
            this.modelUpdated("resources", {removed: [resource]});
            this.modelUpdated("activeResource");
            this.modelUpdated("presence");
            if (!this._notVisibleInRoster)
                for (var g in this.groupsIterator())
                    g._onContactUpdated(this);
            return;
        }
        if (this.activeResource == resource && this._onResourceUpdated(resource, true)) {
            this.modelUpdated("resources", {removed: [resource]})
            account.modelUpdated("resources", {removed: [resource]})
            this.modelUpdated("activeResource");
            this.modelUpdated("presence");
        } else {
            this.modelUpdated("resources", {removed: [resource]});
            account.modelUpdated("resources", {removed: [resource]})
        }
    },

    cmp: function(c, usePresence)
    {
        var res = usePresence ? this.presence.cmp(c.presence) : 0;

        if (res)
            return res;

        return this.visibleName == c.visibleName ? 0 :
            this.visibleName > c.visibleName ? 1 : -1;
    },
}

function Resource(jid, contact)
{
    this.jid = new JID(jid);
    this.contact = contact || account.allContacts[this.jid.normalizedJID.shortJID];

    account.resources[this.jid.normalizedJID] = this;
    this.init();
}

_DECL_(Resource, null, Model, DiscoItem, Comparator).prototype =
{
    _registered: false,
    presence: new Presence("unavailable"),
    representsMe: false,

    get visibleName()
    {
        if (!this.contact.jid.resource && this.jid.resource)
            return this.contact.visibleName + " ("+this.jid.resource+")";

        return this.contact.visibleName;
    },

    onOpenChat: function()
    {
        this.openChatTab();
    },

    onPresence: function(packet, dontNotifyViews)
    {
        if (packet.getType() == "error") {
            var errorTag = packet.getNode().getElementsByTagName('error')[0];
            if (errorTag) {
                // XXX: I don't think it is ideal solution, maybe show it it roster somehow?
                // XXX: Disabled for now
                var text = 0 && errorTag.getElementsByTagName('text');
                if (text)
                    openDialogUniq("ot:error", "chrome://oneweb/content/error.xul",
                                   "chrome", text.textContent);
                return [];
            }
        }

        var oldPresence = this.presence;
        this.presence = new Presence(packet);
        var equal = this.presence.equal(oldPresence);

        if (packet.getType() == "unavailable")
            this._remove();
        else {
            if (!this._registered)
                this.contact._onResourceAdded(this);
            else
                this.contact._onResourceUpdated(this);

            var caps = packet.getNode().
                getElementsByTagNameNS("http://jabber.org/protocol/caps", "c")[0];
            if (caps)
                this.updateCapsInfo(caps);
        }

        if (!dontNotifyViews && !equal)
            this.modelUpdated("presence");

        if (this.presence.show != oldPresence.show ||
            this.presence.status != oldPresence.status)
        this._registered = true;

        return equal ? [] : ["presence"];
    },

    _remove: function()
    {
        if (this._registered)
            this.contact._onResourceRemoved(this);
        delete account.resources[this.jid.normalizedJID];
    },

    cmp: function(c)
    {
        return this.presence.cmp(c.presence, true);
    },
}

function MyResourcesContact(jid)
{
    this.jid = new JID(jid);
    this.groups = [account.otherResourcesGroup];
    this.resources = []

    account.myResources[this.jid.normalizedJID] = this;

    this.init();

    this._updateNick(account.myResource.visibleName);

    account.otherResourcesGroup._onContactAdded(this);
}

_DECL_(MyResourcesContact, Contact).prototype =
{
    subscription: "both",

    onPresence: function() {
        Contact.prototype.onPresence.apply(this, arguments);

        // Explicitly request disco info our other resources
        this.getDiscoInfo(false, function() {});
    },

    _onResourceRemoved: function()
    {
        this.groups[0]._onContactRemoved(this);
        delete account.myResources[this.jid.normalizedJID];
    },

    _updateNick: function(nickname)
    {
        this.name = _("{0}/{1}", nickname, this.jid.resource);
        this.visibleName = _("{0} ({1})", nickname, this.jid.resource);

        this.modelUpdated("visibleName");
        this.modelUpdated("name");
    }
}

function MyResource()
{
    this.init();
}

_DECL_(MyResource, null, Model).prototype =
{
    representsMe: true,

    get presence() {
        return account.currentPresence;
    },

    get jid() {
        return account.myJID;
    },

    get visibleName() {
        return this.nickname || (account.myJID && account.myJID.node) ||
            (account.connectionInfo && account.connectionInfo.user) ||
            _("(Anonymous)");
    },

    _updateNick: function(nick) {
        this.nickname = nick;
        this.modelUpdated("visibleName");
    }
}
