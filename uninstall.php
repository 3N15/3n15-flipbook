<?php

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

$n15fb_ids = get_posts(
	array(
		'post_type'      => 'n15fb_book',
		'post_status'    => 'any',
		'posts_per_page' => -1,
		'fields'         => 'ids',
		'no_found_rows'  => true,
	)
);
foreach ( $n15fb_ids as $n15fb_id ) {
	wp_delete_post( $n15fb_id, true );
}

function n15fb_uninstall_rrmdir( $dir ) {
	if ( ! is_dir( $dir ) ) {
		return;
	}
	foreach ( (array) scandir( $dir ) as $item ) {
		if ( '.' === $item || '..' === $item ) {
			continue;
		}
		$path = $dir . '/' . $item;
		if ( is_dir( $path ) && ! is_link( $path ) ) {
			n15fb_uninstall_rrmdir( $path );
		} else {
			wp_delete_file( $path );
		}
	}
	@rmdir( $dir );
}

$n15fb_uploads = wp_upload_dir( null, false );
n15fb_uninstall_rrmdir( trailingslashit( $n15fb_uploads['basedir'] ) . '3n15-flipbook' );
