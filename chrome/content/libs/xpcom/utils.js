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

var EXPORTED_SYMBOLS = ["findCallerWindow", "soundsPlayer", "DEBUG"];

function findCallerWindow()
{
    var p, c = arguments.callee.caller;
    var callers = [];

    while (c && c.__parent__) {
        p = c.__parent__;
        while (p.__parent__)
            p = p.__parent__;
        if (p instanceof Window)
            return p.wrappedJSObject ? p.wrappedJSObject : p;
        if (callers.indexOf(c) >= 0)
            return null;
        callers.push(c);
        c = c.caller;
    }
    return null;
}

var soundsPlayer = {
    _player: Components.classes["@mozilla.org/sound;1"].
        createInstance(Components.interfaces.nsISound),
    _ios: Components.classes["@mozilla.org/network/io-service;1"].
        getService(Components.interfaces.nsIIOService),

    playSound: function(type, loops) {
        try {
          if (!prefManager.getPref("chat.sounds"))
            return;
          if (this._player) {
            if (!this._threadCreated && !this._thread) {
              this._threadCreated = true;
              try {
                if (navigator.platform.search(/linux/i) >= 0)
                  this._thread = Components.classes["@mozilla.org/thread-manager;1"].
                    getService(Components.interfaces.nsIThreadManager).newThread(0);
              } catch (ex) {}
            }
            var url = this._ios.newURI("chrome://oneweb/content/data/sounds/"+
                                       type+".wav", null, null);
            if (this._thread)
              this._thread.dispatch({run: function(){this.player.play(this.url)}, player: this._player, url: url},
                                    this._thread.DISPATCH_NORMAL);
            else
              this._player.play(url);
          }
        } catch(ex){ alert(ex)}
    }
};

function DEBUG(str) {
    dump(str+"\n");
}
