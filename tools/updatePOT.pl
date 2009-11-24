#!/usr/bin/perl

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

use strict;

use FindBin;
use File::Find;
use File::Spec;
use Cwd qw(realpath getcwd);

use lib ("$FindBin::Bin/perl5lib", "$FindBin::Bin/perl5lib/3rdparty");

use OneTeam::L10N::InputFile;
use OneTeam::L10N::POFile;
use OneTeam::Utils;

chdir($FindBin::RealBin);

my $branding_po = OneTeam::L10N::POFile->new(path => "$FindBin::RealBin/../po/branding/oneweb.pot",
                                             is_branding_file => 1);
my $po = OneTeam::L10N::POFile->new(path => "$FindBin::RealBin/../po/oneweb.pot",
                                    branding_po_file => $branding_po);

find({no_chdir => 1, wanted => sub {
        return if not -f or ignored_file($File::Find::name);

        my $path = realpath($File::Find::name);
        my $if = OneTeam::L10N::InputFile->new(path => File::Spec->abs2rel($path, $FindBin::RealBin));
        $po->sync_strings(@{$if->translatable_strings});
    }}, "$FindBin::RealBin/../chrome/content");

$po->write(undef, 1);
$branding_po->write(undef, 1);
