<?php

namespace N15\Flipbook;

defined( 'ABSPATH' ) || exit;

final class Rest {
	const NS              = '3n15-flipbook/v1';
	const MAX_PAGE_BYTES  = 15 * MB_IN_BYTES;
	const MAX_THUMB_BYTES = 2 * MB_IN_BYTES;

	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'routes' ) );
	}

	public static function routes() {
		$id  = '(?P<id>\d+)';
		$set = '(?P<set>[a-z0-9]{12})';

		register_rest_route(
			self::NS,
			"/books/{$id}/sets",
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'create_set' ),
				'permission_callback' => array( __CLASS__, 'can_edit' ),
			)
		);
		register_rest_route(
			self::NS,
			"/books/{$id}/title",
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'save_title' ),
				'permission_callback' => array( __CLASS__, 'can_edit' ),
				'args'                => array(
					'title' => array(
						'required' => true,
						'type'     => 'string',
					),
				),
			)
		);
		register_rest_route(
			self::NS,
			"/books/{$id}/sets/{$set}",
			array(
				'methods'             => 'DELETE',
				'callback'            => array( __CLASS__, 'delete_set' ),
				'permission_callback' => array( __CLASS__, 'can_edit' ),
			)
		);
		register_rest_route(
			self::NS,
			"/books/{$id}/sets/{$set}/pages",
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'upload_page' ),
				'permission_callback' => array( __CLASS__, 'can_edit' ),
				'args'                => array(
					'index' => array(
						'required'          => true,
						'type'              => 'integer',
						'minimum'           => 0,
						'maximum'           => Storage::MAX_PAGES - 1,
						'sanitize_callback' => 'absint',
					),
				),
			)
		);
		register_rest_route(
			self::NS,
			"/books/{$id}/sets/{$set}/commit",
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'commit' ),
				'permission_callback' => array( __CLASS__, 'can_edit' ),
				'args'                => array(
					'count'    => array(
						'required' => true,
						'type'     => 'integer',
						'minimum'  => 1,
						'maximum'  => Storage::MAX_PAGES,
					),
					'pdf_id'   => array(
						'type'    => 'integer',
						'default' => 0,
					),
					'pdf_name' => array(
						'type'    => 'string',
						'default' => '',
					),
					'title'    => array(
						'type'    => 'string',
						'default' => '',
					),
				),
			)
		);
	}

	public static function can_edit( \WP_REST_Request $req ) {
		$post_id = (int) $req['id'];
		if ( ! $post_id || Plugin::CPT !== get_post_type( $post_id ) ) {
			return new \WP_Error( 'n15fb_not_found', __( 'Flipbook nicht gefunden.', '3n15-flipbook' ), array( 'status' => 404 ) );
		}
		return current_user_can( 'edit_post', $post_id );
	}

	public static function create_set( \WP_REST_Request $req ) {
		$set = Storage::create_set( (int) $req['id'] );
		if ( is_wp_error( $set ) ) {
			return $set;
		}
		return rest_ensure_response( array( 'set' => $set ) );
	}

	public static function delete_set( \WP_REST_Request $req ) {
		$post_id = (int) $req['id'];
		$set     = (string) $req['set'];
		if ( Plugin::get_book( $post_id )['set'] === $set ) {
			return new \WP_Error( 'n15fb_active_set', __( 'Das aktive Set kann nicht verworfen werden.', '3n15-flipbook' ), array( 'status' => 409 ) );
		}
		Storage::delete_set( $post_id, $set );
		return rest_ensure_response( array( 'deleted' => true ) );
	}

	public static function upload_page( \WP_REST_Request $req ) {
		$post_id = (int) $req['id'];
		$set     = (string) $req['set'];
		$index   = (int) $req['index'];
		$dir     = Storage::set_dir( $post_id, $set );
		if ( Plugin::get_book( $post_id )['set'] === $set ) {
			return new \WP_Error( 'n15fb_active_set', __( 'Das aktive Set kann nicht verändert werden.', '3n15-flipbook' ), array( 'status' => 409 ) );
		}
		if ( ! is_dir( $dir ) ) {
			return new \WP_Error( 'n15fb_no_set', __( 'Unbekannter Upload-Vorgang. Bitte neu starten.', '3n15-flipbook' ), array( 'status' => 404 ) );
		}
		$files = $req->get_file_params();

		$page = self::store_image( isset( $files['page'] ) ? $files['page'] : null, $dir, 'p', $index, self::MAX_PAGE_BYTES );
		if ( is_wp_error( $page ) ) {
			return $page;
		}
		$thumb = null;
		if ( ! empty( $files['thumb'] ) ) {
			$thumb = self::store_image( $files['thumb'], $dir, 't', $index, self::MAX_THUMB_BYTES );
			if ( is_wp_error( $thumb ) ) {
				return $thumb;
			}
		}
		return rest_ensure_response(
			array(
				'index' => $index,
				'file'  => $page['name'],
				'w'     => $page['w'],
				'h'     => $page['h'],
				'thumb' => $thumb ? Storage::set_url( $post_id, $set ) . '/' . $thumb['name'] : '',
			)
		);
	}

	private static function store_image( $file, $dir, $kind, $index, $max_bytes ) {
		if ( empty( $file['tmp_name'] ) || ! is_uploaded_file( $file['tmp_name'] ) ) {
			return new \WP_Error( 'n15fb_no_file', __( 'Keine Datei empfangen.', '3n15-flipbook' ), array( 'status' => 400 ) );
		}
		$tmp = $file['tmp_name'];
		if ( filesize( $tmp ) > $max_bytes ) {
			return new \WP_Error( 'n15fb_too_big', __( 'Seitenbild ist zu groß.', '3n15-flipbook' ), array( 'status' => 413 ) );
		}

		$info = @getimagesize( $tmp );
		$ext  = array(
			'image/webp' => 'webp',
			'image/jpeg' => 'jpg',
		);
		if ( ! $info || empty( $info['mime'] ) || ! isset( $ext[ $info['mime'] ] ) ) {
			return new \WP_Error( 'n15fb_bad_type', __( 'Ungültiges Bildformat.', '3n15-flipbook' ), array( 'status' => 415 ) );
		}
		if ( $info[0] < 16 || $info[1] < 16 || $info[0] > 6000 || $info[1] > 9000 ) {
			return new \WP_Error( 'n15fb_bad_size', __( 'Ungültige Bildmaße.', '3n15-flipbook' ), array( 'status' => 400 ) );
		}

		foreach ( $ext as $e ) {
			$old = sprintf( '%s/%s-%04d.%s', $dir, $kind, $index + 1, $e );
			if ( file_exists( $old ) ) {
				wp_delete_file( $old );
			}
		}
		$name = sprintf( '%s-%04d.%s', $kind, $index + 1, $ext[ $info['mime'] ] );
		if ( ! @move_uploaded_file( $tmp, $dir . '/' . $name ) ) {
			return new \WP_Error( 'n15fb_move', __( 'Datei konnte nicht gespeichert werden.', '3n15-flipbook' ), array( 'status' => 500 ) );
		}
		@chmod( $dir . '/' . $name, 0644 );
		return array(
			'name' => $name,
			'w'    => (int) $info[0],
			'h'    => (int) $info[1],
		);
	}

	public static function commit( \WP_REST_Request $req ) {
		$post_id = (int) $req['id'];
		$set     = (string) $req['set'];
		if ( ! is_dir( Storage::set_dir( $post_id, $set ) ) ) {
			return new \WP_Error( 'n15fb_no_set', __( 'Unbekannter Upload-Vorgang. Bitte neu starten.', '3n15-flipbook' ), array( 'status' => 404 ) );
		}
		$pages = Storage::collect_pages( $post_id, $set );
		$count = (int) $req['count'];
		if ( count( $pages ) !== $count ) {
			return new \WP_Error(
				'n15fb_incomplete',
				sprintf( __( 'Unvollständig: %1$d von %2$d Seiten gespeichert.', '3n15-flipbook' ), count( $pages ), $count ),
				array( 'status' => 409 )
			);
		}

		$pdf_id = (int) $req['pdf_id'];
		if ( $pdf_id && ( 'application/pdf' !== get_post_mime_type( $pdf_id ) || ! current_user_can( 'read_post', $pdf_id ) ) ) {
			$pdf_id = 0;
		}

		$book = array(
			'set'      => $set,
			'pages'    => $pages,
			'pdf_id'   => $pdf_id,
			'pdf_name' => sanitize_file_name( (string) $req['pdf_name'] ),
			'updated'  => time(),
		);
		Plugin::set_book( $post_id, $book );
		Storage::delete_other_sets( $post_id, $set );

		$post = get_post( $post_id );
		if ( $post && 'auto-draft' === $post->post_status ) {
			wp_update_post(
				array(
					'ID'          => $post_id,
					'post_title'  => sanitize_text_field( (string) $req['title'] ),
					'post_status' => Plugin::can_publish() ? 'publish' : 'draft',
				)
			);
		}

		return rest_ensure_response(
			array(
				'pages'     => count( $pages ),
				'shortcode' => Plugin::shortcode_for( $post_id ),
				'status'    => get_post_status( $post_id ),
			)
		);
	}

	public static function save_title( \WP_REST_Request $req ) {
		$post_id = (int) $req['id'];
		$title   = sanitize_text_field( (string) $req['title'] );
		$result  = wp_update_post(
			array(
				'ID'         => $post_id,
				'post_title' => $title,
			),
			true
		);
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		return rest_ensure_response( array( 'title' => $title ) );
	}
}
