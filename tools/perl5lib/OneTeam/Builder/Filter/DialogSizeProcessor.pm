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

package OneTeam::Builder::Filter::DialogSizeProcessor;

use base 'OneTeam::Builder::Filter';

use File::Spec::Functions qw(splitpath catfile catpath splitdir catdir);

sub analyze {
    my ($self, $content, $file) = @_;

    return $content unless $file =~ /\.xul$/;

    $content =~ /<\w([^>]*)>/;
    my $match = $1;

    $match =~ /\bwidth=(['"])(.*?)\1/;
    my $width = $2;

    $match =~ /\bheight=(['"])(.*?)\1/;
    my $height = $2;

    (undef, undef, $file) = splitpath($file);
    $self->{sizes}->{$file} = [$width, $height] if $width or $height;

    return $content;
}

sub process {
    my ($self, $content, $file) = @_;

    return $content unless $file =~ /\.(?:js)$/;

    $content =~ s/([^\S\n]*)\@SIZES\@/$self->get_sizes($1)/ge;

    return $content;
}

sub get_sizes {
    my ($self, $indent) = @_;

    my %sizes = %{$self->{sizes}};

    return join ", ", map { "$indent\"$_\": [$sizes{$_}->[0], $sizes{$_}->[1]]" } keys %sizes;
}

1;
