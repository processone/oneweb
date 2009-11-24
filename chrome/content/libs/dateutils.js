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

var EXPORTED_SYMBOLS = ["formatData", "dateToUTCString", "utcStringToDate",
                        "dateToISO8601Timestamp","iso8601TimestampToDate",
                        "readableTimestamp"];
// #ifdef XULAPP
function formatDate(date, locale, dateFormat, timeFormat)
{
    var formater = Components.classes["@mozilla.org/intl/scriptabledateformat;1"].
        getService(Components.interfaces.nsIScriptableDateFormat);

    switch (dateFormat) {
    case "none":
        dateFormat = formater.dateFormatNone;
        break;
    case "long":
        dateFormat = formater.dateFormatLong;
        break;
    case "short":
    default:
        dateFormat = formater.dateFormatShort;
    }

    switch (timeFormat) {
    case "none":
        timeFormat = formater.timeFormatNone;
        break;
    case "long":
        timeFormat = formater.timeFormatSeconds;
        break;
    case "short24":
        timeFormat = formater.timeFormatNoSecondsForce24Hour;
        break;
    case "long24":
        timeFormat = formater.timeFormatSecondsForce24Hour;
        break;
    case "short":
    default:
        timeFormat = formater.timeFormatNoSeconds;
    }
    return formater.FormatDateTime(locale||"", dateFormat, timeFormat,
        date.getFullYear(), date.getMonth()+1, date.getDate(),
        date.getHours(), date.getMinutes(), date.getSeconds());
}
/* #else
function formatDate(date, locale, dateFormat, timeFormat)
{
    var res = "";

    if (dateFormat != "none")
        res += date.getFullYear() + "-" +
            (date.getMonth()+101).toString().substr(1) + "-" +
            (date.getDate()+100).toString().substr(1);

    if (timeFormat == "none")
        return res;

    res += (res ? " " : "") +
        (date.getHours()+100).toString().substr(1) + ":" +
        (date.getMinutes()+100).toString().substr(1);
    if (timeFormat == "short" || timeFormat == "short24")
        res += ":" + (date.getSeconds()+100).toString().substr(1);

    return res;
}
// #endif */

function dateToUTCString(date)
{
    var res, c;

    with (date) {
        res = getUTCFullYear().toString();
        c = (getUTCMonth()+1).toString();
        res += c.length < 2 ? "0"+c : c;
        c = getUTCDate().toString();
        res += c.length < 2 ? "0"+c : c;
        c = getUTCHours().toString();
        res += c.length < 2 ? "T0"+c : "T"+c;
        c = getUTCMinutes().toString();
        res += c.length < 2 ? ":0"+c : ":"+c;
        c = getUTCSeconds().toString();
        res += c.length < 2 ? ":0"+c : ":"+c;
    }
    return res;
}

function utcStringToDate(string)
{
    var date = new Date();

    date.setUTCFullYear(string.substr(0,4));
    date.setUTCMonth(string.substr(4,2)-1);
    date.setUTCDate(string.substr(6,2));
    date.setUTCHours(string.substr(9,2) || 0);
    date.setUTCMinutes(string.substr(12,2) || 0);
    date.setUTCSeconds(string.substr(15,2) || 0);

    return date;
}

function dateToISO8601Timestamp(date, accuracy)
{
    var str = "", tz;

    switch (accuracy) {
        default:
            str = "T"+(100+date.getHours()).toString().substr(1)+":"+
                    (100+date.getMinutes()).toString().substr(1);
            if (!accuracy || accuracy > 3)
                str+= ":"+(100+date.getSeconds()).toString().substr(1);
            if (accuracy > 4)
                str+= "."+(1000+date.getMilliseconds()).toString().substr(1,2);

            if ((tz = date.getTimezoneOffset())) {
                if (tz > 0)
                    str += "-";
                else if (tz < 0) {
                    str += "+";
                    tz = -tz;
                }
                str += (100+parseInt(tz/60)).toString().substr(1)+":"+
                    (100+(tz%60)).toString().substr(1);
            } else
                str+="Z";
        case 2:
            str = "-"+(100+date.getDate()).toString().substr(1) + str;
        case 1:
            str = "-"+(101+date.getMonth()).toString().substr(1) + str;
        case 0:
            str = (10000+date.getFullYear()).toString().substr(1) + str;
    }
    return str;
}

function iso8601TimestampToDate(string)
{
    var match = string.match(/(\d+)-(\d+)-(\d+)T(\d+):(\d+):(\d+)(?:\.(\d+))?(?:([+-])(\d+):(\d+))?/)
    var date = Date.UTC(match[1], +match[2]-1 || 0, match[3] || 1,
                        match[4] || 0, match[5] || 0, match[6] || 0, match[7] || 0);
    if (match[8])
        date += (match[8] == "+" ? -1 : 1) *
            ((+match[9] || 0)*60 + (+match[10] || 0))*60*1000;

    return new Date(date);
}

function readableTimestamp(date)
{
    const dayMap = ["Sunday", "Monday", "Tuesday", "Wednesday",
                    "Thursday", "Friday", "Saturday"];

    var now = new Date();
    var d1 = new Date(now), d2 = new Date(date);

    d1.setHours(0); d1.setMinutes(0); d1.setSeconds(0); d1.setMilliseconds(0);
    d2.setHours(0); d2.setMinutes(0); d2.setSeconds(0); d2.setMilliseconds(0);

    var days = (d1-d2)/24/60/60/1000;
    if (days == 0)
        return formatDate(date, null, "none", "short");
    if (days == 1)
        return "Yesterday "+formatDate(date, null, "none", "short");
    if (days > 1 && days < 6)
        return dayMap[date.getDay()] + " "+formatDate(date, null, "none", "short");

    return formatDate(date, null, "short", "short");
}
