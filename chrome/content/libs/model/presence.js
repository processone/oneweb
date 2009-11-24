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

var EXPORTED_SYMBOLS = ["Presence"];

ML.importMod("roles.js");
ML.importMod("utils.js");
ML.importMod("modeltypes.js");

function Presence(show, status, priority)
{
    if (show instanceof JSJaCPresence) {
        var pkt = show, type = show.getType();
        if (this._showValues[type] === 0)
            this.show = type;
        else
            this.show = pkt.getShow();

        if (!this.show || !(this.show in this._showValues))
            this.show = "available";
        this.status = pkt.getStatus()
        this.priority = pkt.getPriority();
    } else {
        this.show = show;
        if (!this.show || !(this.show in this._showValues))
            this.show = "available";

        this.status = status;
        this.priority = priority == null || isNaN(+priority) ?
            this._priorityMap[this.show] : +priority;
    }
}

_DECL_(Presence, null, Comparator).prototype =
{
    _showValues: {
        available: 1,
        chat: 1,
        dnd: 1,
        away: 1,
        xa: 1,
        unavailable: 0,
        invisible: 0,
        subscribe: 0,
        subscribed: 0,
        unsubscribe: 0,
        unsubscribed: 0
    },

    generatePacket: function(contact)
    {
        var pkt = new JSJaCPresence();
        if (contact)
            pkt.setTo(contact.jid || contact);

        var presence = this;

        if (this._showValues[presence.show] === 0)
            pkt.setType(presence.show);
        else {
            if (presence.show && presence.show != "available")
                pkt.setShow(presence.show);

            pkt.setPriority(presence.priority == null ?
                            prefManager.getPref("chat.connection.priority") :
                            presence.priority);

            servicesManager.appendCapsToPresence(pkt.getNode());
        }

        if (presence.status)
            pkt.setStatus(presence.status);

        return pkt;
    },

    equal: function(p)
    {
        return this.show == p.show && this.status == p.status &&
            this.priority == p.priority;
    },

    cmp: function(p, comparePriority)
    {
        const show2num = {chat: 0, available: 1, dnd: 2, away:3, xa: 4,
                          unavailable: 5};

        if (comparePriority)
            if (this.priority != p.priority)
                return p.priority - this.priority;

        return show2num[this.show||"available"] - show2num[p.show||"available"];
    },

    statusToString: {
        available: _("Available"),
        chat: _("Available for chat"),
        dnd: _("Busy"),
        away: _("Away"),
        xa: _("Not available"),
        unavailable: _("Offline"),
        invisible: _("Invisible")
    },

    toString: function(showStatus, lowerCase)
    {
        var showStr = this.statusToString[this.show];
        if (lowerCase)
            showStr = showStr.toLowerCase();

        return showStr+(showStatus && this.status ? " ("+this.status+")" : "");
    },

    get serialized() {
        return {
            show: this.show,
            status: this.status || "",
            priority: this.priority,
            showString: this.toString(),
            style: this.getStyle(),
            icon: makeDataUrlFromFile(this.getIcon())
        };
    },

    _priorityMap: {
        available: 50,
        chat: 50,
        dnd: 40,
        away: 30,
        xa: 20,
        unavailable: 0
    }
}
