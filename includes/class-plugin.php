<?php

namespace N15\Flipbook;

defined( 'ABSPATH' ) || exit;

final class Plugin {
	const CPT          = 'n15fb_book';
	const META_BOOK    = '_n15fb_book';
	const META_OPTIONS = '_n15fb_options';
	const SHORTCODE    = '3n15_flipbook';
	const CURL_LEVELS  = array(
		'flat'    => 0,
		'soft'    => 0.6,
		'natural' => 1,
		'strong'  => 1.4,
	);

	public static function init() {
		add_action( 'init', array( __CLASS__, 'load_textdomain' ), 0 );
		add_action( 'init', array( __CLASS__, 'register_post_type' ) );
		add_action( 'before_delete_post', array( __CLASS__, 'on_delete_post' ) );

		Rest::init();
		Admin::init();
		Frontend::init();
	}

	public static function load_textdomain() {
		load_plugin_textdomain( '3n15-flipbook', false, dirname( plugin_basename( FILE ) ) . '/languages' );
	}

	public static function register_post_type() {
		register_post_type(
			self::CPT,
			array(
				'labels'          => array(
					'name'               => __( 'Flipbooks', '3n15-flipbook' ),
					'singular_name'      => __( 'Flipbook', '3n15-flipbook' ),
					'add_new'            => __( 'Hinzufügen', '3n15-flipbook' ),
					'add_new_item'       => __( 'Flipbook hinzufügen', '3n15-flipbook' ),
					'edit_item'          => __( 'Flipbook bearbeiten', '3n15-flipbook' ),
					'new_item'           => __( 'Flipbook', '3n15-flipbook' ),
					'search_items'       => __( 'Flipbook suchen', '3n15-flipbook' ),
					'not_found'          => __( 'Noch keine Flipbooks vorhanden', '3n15-flipbook' ),
					'not_found_in_trash' => __( 'Der Papierkorb ist leer', '3n15-flipbook' ),
					'all_items'          => __( 'Alle Flipbooks', '3n15-flipbook' ),
					'menu_name'          => __( '3N15 Flipbook', '3n15-flipbook' ),
				),
				'public'              => false,
				'show_ui'             => true,
				'show_in_menu'        => true,
				'show_in_rest'        => false,
				'exclude_from_search' => true,
				'menu_icon'           => 'dashicons-book',
				'menu_position'       => 26,
				'supports'            => array( 'title' ),
				'capability_type'     => 'post',
				'map_meta_cap'        => true,
			)
		);
	}

	public static function get_book( $post_id ) {
		$d = get_post_meta( $post_id, self::META_BOOK, true );
		$d = is_array( $d ) ? $d : array();
		$d = wp_parse_args(
			$d,
			array(
				'set'      => '',
				'pages'    => array(),
				'pdf_id'   => 0,
				'pdf_name' => '',
				'updated'  => 0,
			)
		);
		$d['pages'] = is_array( $d['pages'] ) ? array_values( $d['pages'] ) : array();
		return $d;
	}

	public static function set_book( $post_id, array $book ) {
		update_post_meta( $post_id, self::META_BOOK, $book );
	}

	public static function default_options() {
		return array(
			'download'  => 1,
			'overview'  => 1,
			'accent'    => '#2450D0',
			'max_width' => 1200,
			'curl'      => 'natural',
		);
	}

	public static function get_options( $post_id ) {
		$o = get_post_meta( $post_id, self::META_OPTIONS, true );
		$o = is_array( $o ) ? $o : array();
		if ( ! isset( $o['curl'] ) && isset( $o['bend'] ) ) {
			$o['curl'] = self::curl_from_factor( absint( $o['bend'] ) / 100 );
		}
		return wp_parse_args( $o, self::default_options() );
	}

	public static function curl_factor( $curl ) {
		return is_string( $curl ) && isset( self::CURL_LEVELS[ $curl ] ) ? self::CURL_LEVELS[ $curl ] : self::CURL_LEVELS['natural'];
	}

	private static function curl_from_factor( $factor ) {
		$best = 'natural';
		foreach ( self::CURL_LEVELS as $key => $value ) {
			if ( abs( $value - $factor ) < abs( self::CURL_LEVELS[ $best ] - $factor ) ) {
				$best = $key;
			}
		}
		return $best;
	}

	public static function sanitize_options( array $in ) {
		$def    = self::default_options();
		$accent = isset( $in['accent'] ) ? sanitize_hex_color( $in['accent'] ) : '';
		return array(
			'download'  => empty( $in['download'] ) ? 0 : 1,
			'overview'  => empty( $in['overview'] ) ? 0 : 1,
			'accent'    => $accent ? $accent : $def['accent'],
			'max_width' => isset( $in['max_width'] ) ? max( 480, min( 2000, absint( $in['max_width'] ) ) ) : $def['max_width'],
			'curl'      => isset( $in['curl'] ) && is_string( $in['curl'] ) && isset( self::CURL_LEVELS[ $in['curl'] ] ) ? $in['curl'] : $def['curl'],
		);
	}

	public static function set_options( $post_id, array $options ) {
		update_post_meta( $post_id, self::META_OPTIONS, self::sanitize_options( $options ) );
	}

	public static function shortcode_for( $post_id ) {
		return '[' . self::SHORTCODE . ' id="' . absint( $post_id ) . '"]';
	}

	public static function find( $id ) {
		$id   = trim( (string) $id );
		$post = null;
		if ( '' === $id ) {
			return null;
		}
		if ( ctype_digit( $id ) ) {
			$post = get_post( (int) $id );
		} else {
			$found = get_posts(
				array(
					'post_type'      => self::CPT,
					'name'           => sanitize_title( $id ),
					'posts_per_page' => 1,
					'post_status'    => 'publish',
					'no_found_rows'  => true,
				)
			);
			$post  = $found ? $found[0] : null;
		}
		if ( ! $post || self::CPT !== $post->post_type || 'publish' !== $post->post_status ) {
			return null;
		}
		return $post;
	}

	public static function can_publish() {
		$type = get_post_type_object( self::CPT );
		return $type && current_user_can( $type->cap->publish_posts );
	}

	public static function on_delete_post( $post_id ) {
		if ( self::CPT === get_post_type( $post_id ) ) {
			Storage::delete_book( $post_id );
		}
	}
}
