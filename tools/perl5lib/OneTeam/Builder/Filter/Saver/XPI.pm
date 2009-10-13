package OneTeam::Builder::Filter::Saver::XPI;

use base 'OneTeam::Builder::Filter::Saver';

use File::Temp 'tempdir';
use File::Path;
use File::Find;
use File::Spec::Functions qw(splitpath catfile catpath splitdir catdir);
use File::Copy;
use OneTeam::Utils;
use Cwd;

sub new {
    my ($class, $topdir, $version, $buildid, $updateURL) = @_;
    my $self = {
        topdir => $topdir,
        outputdir => tempdir('otXXXXXX', TMPDIR => 1, CLEANUP => 1),
        version => $version,
        buildid => $buildid,
        updateURL => $updateURL,
    };
    bless $self, $class;
}

sub analyze {
    my ($self, $content, $file) = @_;

    $self->{skins}->{$1} = 1 if $file =~ /(?:^|[\\\/])skin[\\\/]([^\\\/]*)[\\\/]/;

    return $content;
}

sub path_convert {
    my ($self, $file, $locale) = @_;

    return catfile($self->{outputdir}, "chrome", "locale", $1)
        if $file =~ /(?:^|[\\\/])(branding[\\\/].*)/;

    return catfile($self->{outputdir}, $file);
}

sub finalize {
    my $self = shift;

    my $tmpdir = tempdir('otXXXXXX', TMPDIR => 1, CLEANUP => 1);
    my $chromedir = catdir($tmpdir, "chrome");

    mkpath([$chromedir], 0);

    $self->_prepare_files($tmpdir, $chromedir);
    $self->_generate_install_rdf($tmpdir);
    $self->_generate_chrome_manifest($tmpdir);

    system("cd '$tmpdir'; zip -q -9 -r '".catfile($self->{topdir}, $self->_output_filename)."' .");

    return ($tmpdir, $chromedir);
}

sub _prepare_files {
    my ($self, $tmpdir, $chromedir) = @_;

    dircopy(catdir(qw(chrome icons default)), catdir($self->{outputdir}, qw(skin default icons)),
             qw(default.ico default.xpm));

    system("cd '$self->{outputdir}/chrome'; zip -q -0 -r '".catfile($chromedir, 'oneweb.jar')."' .");

    dircopy(catdir($self->{outputdir}, "defaults"), catdir($tmpdir, 'defaults'),
            $self->_disabled_prefs);
    dircopy(catdir($self->{outputdir}, "components"), catdir($tmpdir, 'components'));
    dircopy('platform', catdir($tmpdir, 'platform'));
}

sub _generate_install_rdf {
    my ($self, $tmpdir) = @_;
    my $ir = slurp("install.rdf");

    $ir =~ s/(em:version>)[^<]*/$1.$self->{version}->()/ei;
    $ir =~ s/(em:updateURL>)[^<]*/$1.$self->{updateURL}/ei if $self->{updateURL};
    print_to_file(catfile($tmpdir, "install.rdf"), $ir);
}

sub _generate_chrome_manifest {
    my ($self, $tmpdir) = @_;
    my $prefix = File::Spec->abs2rel("chrome", $self->_chrome_manifest_dir);
    $prefix = $prefix eq "." ? "" : "$prefix/";

    open($fh, ">", catfile($tmpdir, $self->_chrome_manifest_dir, 'chrome.manifest')) or
        die "Unable to create file: $!";
    print $fh "content oneweb jar:${prefix}oneweb.jar!/content/\n";

    print $fh "skin oneweb classic/1.0 jar:${prefix}oneweb.jar!/skin/\n";

    print $fh "locale oneweb $_ jar:${prefix}oneweb.jar!/locale/$_/\n"
        for @{$self->{locales}};
    print $fh "locale oneweb-branding $_ jar:${prefix}oneweb.jar!/locale/branding/\n"
        for @{$self->{locales}};
    print $fh "overlay chrome://browser/content/browser.xul chrome://oneweb/content/overlays/browserOverlay.xul"
        if $self->_add_browser_overlays;
    close($fh);
}

sub _chrome_manifest_dir {
    return "";
}

sub _add_browser_overlays {
    return 1;
}

sub _disabled_prefs {
    return "defaults/preferences/xulapp.js";
}

sub _output_filename {
    return "oneweb.xpi";
}

sub _expand_str {
    my ($self, $mac, $str) = @_;

    return undef if not $str;

    $str =~ s/\@VERSION\@/$self->{version}->()/e;
    $str =~ s/\@BUILDID\@/$self->{buildid}->()/e;
    $str =~ s/\@MAC_SUFFIX\@/$mac ? "-mac" : ""/e;

    return $str;
}

1;
