<?php
/**
 * Plugin Name:       3N15 Flipbook
 * Description:       Macht aus einem PDF ein blätterbares 3D-Buch. Die Umwandlung läuft im Browser, eingebunden wird per Shortcode [3n15_flipbook id="…"].
 * Version:           0.2.0
 * Requires at least: 6.5
 * Requires PHP:      7.4
 * Author:            3N15.COM
 * Author URI:        https://3n15.com
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       3n15-flipbook
 * Domain Path:       /languages
 *
 * Copyright (C) 2026 3N15.COM
 */

namespace N15\Flipbook;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const VERSION = '0.2.0';
const FILE    = __FILE__;

define( 'N15FB_DIR', plugin_dir_path( __FILE__ ) );
define( 'N15FB_URL', plugin_dir_url( __FILE__ ) );

require_once N15FB_DIR . 'includes/class-plugin.php';
require_once N15FB_DIR . 'includes/class-storage.php';
require_once N15FB_DIR . 'includes/class-rest.php';
require_once N15FB_DIR . 'includes/class-admin.php';
require_once N15FB_DIR . 'includes/class-frontend.php';

Plugin::init();

register_activation_hook(
	__FILE__,
	static function () {
		Plugin::register_post_type();
		flush_rewrite_rules();
	}
);
