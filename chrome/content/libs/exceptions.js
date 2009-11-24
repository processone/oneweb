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

var EXPORTED_SYMBOLS = ["dumpStack", "exceptionToString",
                        "logExceptionInConsole", "GenericError",
                        "InvalidArgsError", "Error.prototype.toString",
                        "Components.interfaces.nsIException.toString"];

ML.importMod("roles.js");

function dumpStack(stackFrame, indent, skipFrames)
{
    var stacktrace = "";

    skipFrames = skipFrames || 0;
    indent = indent || "";
    if (!stackFrame) {
        stackFrame = (new Error()).stack;
        skipFrames += 2;
    }

    if (typeof(stackFrame) == "string") {
        var tmp = stackFrame.split("\n");

        for (var i = 0; i < tmp.length-1; i++) {
            if (skipFrames-- > 0)
                continue;
            var m = tmp[i].lastIndexOf("@");
            var fun = tmp[i].slice(0, m);
            if (fun[0] == "(")
                fun = "anonymous"+fun;
            stacktrace += indent+fun+" at "+tmp[i].slice(m+1)+"\n";
        }
    } else if ("filename" in stackFrame) {
        while (stackFrame && stackFrame.caller) {
            stacktrace += indent+stackFrame.name+"(<unknown>) at "+
                (stackFrame.filename||"<unknown>")+":"+
                (stackFrame.lineNumber||"<unknown>")+"\n";
            stackFrame = stackFrame.caller;
        }
    }
    return stacktrace;
}

/**
 *   Returns human readable text representation of exception.
 *
 *  @tparam Exception exc Exception to process.
 *  @tparam String indent Text which will be appended on begin of each
 *    line. Can be *null*
 *
 *  @treturn String String representation of exception passed as \em
 *    exc.
 */
function exceptionToString(exc, indent)
{
    var frames, stacktrace, pos, i, msg, tmp;

    indent = indent || "";

    if (exc) {
// #ifdef XULAPP
        if (exc instanceof Components.interfaces.nsIException) {
            msg = indent+"Exception '"+exc.message+"' - "+
            exc.result+"("+exc.name+") thrown at " +
            exc.filename+":"+exc.lineNumber+"\n";

            if (exc.inner)
                msg += indent+"Caused by:\n" +
                    arguments.callee(exc.inner, indent+"  ");

            return msg+indent+"Stacktrace:\n"+
                dumpStack(exc.location, indent+"   ");
        } else if (exc instanceof Error || exc.stack) {
/* #else
        if (exc instanceof Error || exc.stack) {
// #endif */
            msg = indent+"Exception '"+exc.message+"' thrown at " +
            exc.fileName+":"+exc.lineNumber +"\n";

            if (exc.reason)
                msg += indent+"Caused by:\n" + arguments.callee(exc.reason, indent+"  ");

            return msg+indent+"Stacktrace:\n"+
                dumpStack(exc.stack, indent+"   ");
        } else if (exc.code) {
            var codeStr = "";
            for (var i in exc)
                if (exc[i] == exc.code && i != "code") {
                    codeStr = " ("+i+")";
                    break;
                }

            var location = exc.toString().replace(/.*"(\S+).*?:\s*(\d+)".*/, "$1:$2");
            location = location == exc.toString() ? "" : " thrown at "+location;

            return indent+"Exception: "+exc.code+codeStr+" - '"+exc.message+"'"+location+"\n"+
                (exc.reason ? indent+"Caused by:\n" +
                 arguments.callee(exc.reason,indent+"  ")+"\n":"");
        } else
            return indent+uneval(exc);
    } else
        return indent+"Null exception\n";
}

function logExceptionInConsole(exc)
{
// #ifdef XULAPP
    var cs = Components.classes["@mozilla.org/consoleservice;1"].
        getService(Components.interfaces.nsIConsoleService);
    var se = Components.classes["@mozilla.org/scripterror;1"].
        createInstance(Components.interfaces.nsIScriptError);
    var msg = exceptionToString(exc);
    var file = exc && (exc.fileName || exc.filename);
    var line = exc && exc.lineNumber;

    se.init(msg, file, null, line, 0, 0, "component");
    cs.logMessage(se);
// #endif
}

Error.prototype.toString = function() {
    return exceptionToString(this, "");
}
// #ifdef XULAPP
Components.interfaces.nsIException.toString = Error.prototype.toString;
// #endif

/**
 * Base class for all exception classes.
 *
 * \anchor GenericError_inheritance
 * This class needs special kind of inheritance, just use this snippet:
 * \code
 *   function MyError(message, reason) {
 *     return GenericError.call(this, message||"MyError", reason)
 *   }
 * \endcode
 * @ctor
 * Create new generic exception object. This Exception is based on
 *   built-in Error object (thanks to this, we have access to stack
 *   traces).
 *
 * @tparam String message Message associated with exception.
 * @tparam Error reason Exception which causes this exception. Can be *null*
 */
function GenericError(message, reason) {
    var exc;
// #ifdef XULAPP
    var stack = Components.stack.caller;
    var fun = arguments.callee;

    do {

        while (stack && stack.filename == null)
            stack = stack.caller;

        if (!stack) {
            stack = Components.stack.caller;
            break;
        }

        if (fun.prototype === this.__proto__)
            break;
        fun = fun.caller;
        stack = stack.caller;
    } while (true);

    exc = new Error(message,
            stack.filename,
            stack.lineNumber);
/* #else
    exc = new Error(message);
// #endif */
    exc.__proto__ = this.__proto__;

    if (reason)
        exc.reason = reason;
    return exc;
}

_DECL_NOW_(GenericError, Error);

/**
 * Exception which should be thrown when invalid argument is passed.
 * \see \ref GenericError_inheritance "GenericError" for inheritance
 * instructions.
 *
 * @ctor
 *
 * Create new InvalidArgsError exception;
 *
 * @tparam String message Message associated with exception.
 * @tparam Error reason Exception which causes this exception. Can be *null*
 */
function InvalidArgsError(message, reason) {
    return GenericError.call(this, message||"InvalidArgsError", reason);
}

_DECL_NOW_(InvalidArgsError, GenericError);

//function registerExceptionCatcher() {
//}
