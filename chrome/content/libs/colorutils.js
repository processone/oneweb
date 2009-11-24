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

var EXPORTED_SYMBOLS = ["LUVColor", "HSVColor", "RGBColor"];

function LUVColor(l, u, v)
{
    [this.l, this.u, this.v] = arguments;
}

_DECL_(LUVColor).prototype =
{
    toRGB: function()
    {
        const Xr = 0.31382;
        const Yr = 0.33100;
        const Zr = 1;
        const u0 = 4*Xr/(Xr + 15*Yr +3*Zr);
        const v0 = 9*Yr/(Xr + 15*Yr +3*Zr);

        var Y = this.l > 903.3*0.008856 ? Math.pow((this.l+16)/116, 3) : this.l/903.3
        var a = (52*this.l/(this.u + 14*this.l*u0 -1))/3;
        var d = this.y*(39*this.l/(this.v + 13*this.l*v0) - 5);
        var X = (d + 5*Y)/(a + 1/3);
        var Z = X*a -5*Y;
    }
}

function HSVColor(h, s, v)
{
    this.h = h;
    this.s = s;
    this.v = v;
}

_DECL_(HSVColor).prototype =
{
    toRGB: function()
    {
        var h = this.h/60;

        if (this.s == 0)
            return new RGBColor(this.v, this.v, this.v);

        var part = Math.floor(h);
        var f = h - part;
        var p = this.v*(1 - this.s);
        var q = this.v*(1 - this.s*f);
        var t = this.v*(1 - this.s*(1 - f));

        switch (part) {
            case 0: return new RGBColor(this.v, t, p);
            case 1: return new RGBColor(q, this.v, p);
            case 2: return new RGBColor(p, this.v, t);
            case 3: return new RGBColor(p, q, this.v);
            case 4: return new RGBColor(t, p, this.v);
            default: return new RGBColor(this.v, p, q);
        }
    }
}

function RGBColor(r, g, b) {
    if (r[0] == "#")
        if (r.length == 4)
            [this.r, this.g, this.b] =
                [parseInt(r.substr(1,1), 16)/15,
                 parseInt(r.substr(2,1), 16)/15,
                 parseInt(r.substr(3,1), 16)/15];
        else
            [this.r, this.g, this.b] =
                [parseInt(r.substr(1,2), 16)/255,
                 parseInt(r.substr(3,2), 16)/255,
                 parseInt(r.substr(5,2), 16)/255];
    else
        [this.r, this.g, this.b] = arguments;
}

_DECL_(RGBColor).prototype = {
    toString: function() {
        return "#"+("0"+Math.floor(this.r*255).toString(16)).substr(-2)+
                   ("0"+Math.floor(this.g*255).toString(16)).substr(-2)+
                   ("0"+Math.floor(this.b*255).toString(16)).substr(-2);
    },
    blend: function(r, g, b) {
        if (arguments.length == 1)
            return this.blend(r, r, r);
        return new RGBColor(this.r*r, this.g*g+this.b*b);
    },
    composite: function(c, r) {
        return new RGBColor(this.r*r+c.r*(1-r), this.g*r+c.g*(1-r), this.b*r+c.b*(1-r));
    },
    distance: function(otherColor)
    {
        var rmean = (this.r + otherColor.r)/2;
        var r = this.r - otherColor.r;
        var g = this.g - otherColor.g;
        var b = this.b - otherColor.b;
        return Math.sqrt((2+(rmean/256))*r*r + 4*g*g + (2+((255-rmean)/256))*b*b);
    }
}

