# ***** BEGIN LICENSE BLOCK *****
# Version: MPL 1.1/GPL 2.0/LGPL 2.1
#
# The contents of this file are subject to the Mozilla Public License Version
# 1.1 (the "License"); you may not use this file except in compliance with
# the License. You may obtain a copy of the License at
# http://www.mozilla.org/MPL/
#
# Software distributed under the License is distributed on an "AS IS" basis,
# WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
# for the specific language governing rights and limitations under the
# License.
#
# The Original Code is OneWeb.
#
# The Initial Developer of the Original Code is
# ProcessOne.
# Portions created by the Initial Developer are Copyright (C) 2009
# the Initial Developer. All Rights Reserved.
#
# Contributor(s):
#
# Alternatively, the contents of this file may be used under the terms of
# either the GNU General Public License Version 2 or later (the "GPL"), or
# the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
# in which case the provisions of the GPL or the LGPL are applicable instead
# of those above. If you wish to allow use of your version of this file only
# under the terms of either the GPL or the LGPL, and not to allow others to
# use your version of this file under the terms of the MPL, indicate your
# decision by deleting the provisions above and replace them with the notice
# and other provisions required by the GPL or the LGPL. If you do not delete
# the provisions above, a recipient may use your version of this file under
# the terms of any one of the MPL, the GPL or the LGPL.
#
# ***** END LICENSE BLOCK *****

package OneTeam::Builder::Utils;

use File::Spec::Functions qw(catdir);
use OneTeam::Utils;
use strict;
require Exporter;

our @ISA = qw(Exporter);
our @EXPORT = qw(get_version get_branch extract_prefs);

my $version;
my $branch;
my %prefs;

sub get_version {
    my $topdir = shift;

    return $version if defined $version;

    my $gitdir = catdir($topdir, '.git');
    $gitdir = $topdir if not -d $gitdir;

    my $verstr = `git --git-dir="$gitdir" describe HEAD`;

    $verstr =~ /^v([^-]+)(?:-(\d+))?/;
    $version = $2 ? "$1.$2" : $1;

    return $version
}

sub get_branch {
    my $topdir = shift;

    return $branch if defined $branch;

    my $gitdir = catdir($topdir, '.git');
    $gitdir = $topdir if not -d $gitdir;

    $branch = `git name-rev HEAD`;
    $branch = "UNKNOWN" if not $branch =~ s/HEAD\s+(.*?)\s*$/$1/;

    return $branch
}

sub extract_prefs {
    my $prefs_id = join ",",@_;

    return $prefs{$prefs_id} if $prefs{$prefs_id};

    my $match = shift;
    my %p;

    %p = (%p, _extract_prefs($match, $_)) for @_;

    my $res;
    $res .= "\t\"$_\": $p{$_},\n" for sort keys %p;

    return $prefs{$prefs_id} = $res;
}

sub _extract_prefs {
    my ($match, $path) = @_;
    my $file = slurp($path);
    my $ws = qr!(?>(?:\s*|//[^\n]*|/\*.*?\*/)*)!;
    my %prefs;

    while ($file =~ m!$ws pref $ws
           \( $ws
             (?:
              " ((?:[^"\\]|\\.)*) " |
              ' ((?:[^"\\]|\\.)*) '
             ) $ws , $ws
             (
              " (?:[^"\\]|\\.)* " |
              ' (?:[^"\\]|\\.)* ' |
              [+-]?\d+(?:\.\d+)? |
              true |
              false
             ) $ws
            \)!gx)
    {
        my $name = $1 || $2;
        my $val = $3;
        $prefs{$name} = $val if not $match or $match->($name);
    }

    return %prefs;
}

1;
