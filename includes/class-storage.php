<?php

namespace N15\Flipbook;

defined( 'ABSPATH' ) || exit;

final class Storage {
	const DIR        = '3n15-flipbook';
	const SET_REGEX  = '/^[a-z0-9]{12}$/';
	const PAGE_REGEX = '/^([pt])-(\d{4})\.(webp|jpg)$/';
	const MAX_PAGES  = 999;

	public static function book_base( $post_id ) {
		$u = wp_upload_dir( null, false );
		return array(
			'dir' => trailingslashit( $u['basedir'] ) . self::DIR . '/' . absint( $post_id ),
			'url' => trailingslashit( $u['baseurl'] ) . self::DIR . '/' . absint( $post_id ),
		);
	}

	public static function is_valid_set( $set ) {
		return is_string( $set ) && 1 === preg_match( self::SET_REGEX, $set );
	}

	public static function set_dir( $post_id, $set ) {
		return self::book_base( $post_id )['dir'] . '/' . $set;
	}

	public static function set_url( $post_id, $set ) {
		return self::book_base( $post_id )['url'] . '/' . $set;
	}

	public static function create_set( $post_id ) {
		self::cleanup_stale_sets( $post_id );
		$set = strtolower( wp_generate_password( 12, false, false ) );
		$dir = self::set_dir( $post_id, $set );
		if ( ! wp_mkdir_p( $dir ) ) {
			return new \WP_Error( 'n15fb_mkdir', __( 'Upload-Ordner konnte nicht angelegt werden.', '3n15-flipbook' ), array( 'status' => 500 ) );
		}
		self::protect_dir( self::book_base( $post_id )['dir'] );
		self::protect_dir( $dir );
		return $set;
	}

	public static function protect_dir( $dir ) {
		$f = trailingslashit( $dir ) . 'index.php';
		if ( ! file_exists( $f ) ) {
			file_put_contents( $f, "<?php\n" );
		}
	}

	public static function collect_pages( $post_id, $set ) {
		$dir   = self::set_dir( $post_id, $set );
		$pages  = array();
		$thumbs = array();

		foreach ( (array) glob( $dir . '/*' ) as $path ) {
			$name = basename( $path );
			if ( ! preg_match( self::PAGE_REGEX, $name, $m ) ) {
				continue;
			}
			$i = (int) $m[2];
			if ( 't' === $m[1] ) {
				$thumbs[ $i ] = $name;
				continue;
			}
			$size        = @getimagesize( $path );
			$pages[ $i ] = array(
				'f' => $name,
				't' => '',
				'w' => $size ? (int) $size[0] : 0,
				'h' => $size ? (int) $size[1] : 0,
			);
		}
		ksort( $pages );
		foreach ( $pages as $i => $p ) {
			$pages[ $i ]['t'] = isset( $thumbs[ $i ] ) ? $thumbs[ $i ] : $p['f'];
		}
		return array_values( $pages );
	}

	public static function delete_other_sets( $post_id, $keep ) {
		foreach ( self::list_sets( $post_id ) as $set ) {
			if ( $set !== $keep ) {
				self::rrmdir( self::set_dir( $post_id, $set ) );
			}
		}
	}

	public static function cleanup_stale_sets( $post_id ) {
		$active = Plugin::get_book( $post_id )['set'];
		foreach ( self::list_sets( $post_id ) as $set ) {
			$dir = self::set_dir( $post_id, $set );
			if ( $set !== $active && filemtime( $dir ) < time() - DAY_IN_SECONDS ) {
				self::rrmdir( $dir );
			}
		}
	}

	public static function list_sets( $post_id ) {
		$out = array();
		foreach ( (array) glob( self::book_base( $post_id )['dir'] . '/*', GLOB_ONLYDIR ) as $d ) {
			$set = basename( $d );
			if ( self::is_valid_set( $set ) ) {
				$out[] = $set;
			}
		}
		return $out;
	}

	public static function delete_set( $post_id, $set ) {
		if ( self::is_valid_set( $set ) ) {
			self::rrmdir( self::set_dir( $post_id, $set ) );
		}
	}

	public static function delete_book( $post_id ) {
		self::rrmdir( self::book_base( $post_id )['dir'] );
	}

	public static function rrmdir( $dir ) {
		$u    = wp_upload_dir( null, false );
		$root = wp_normalize_path( trailingslashit( $u['basedir'] ) . self::DIR . '/' );
		$dir  = wp_normalize_path( $dir );
		if ( 0 !== strpos( $dir, $root ) || ! is_dir( $dir ) ) {
			return;
		}
		foreach ( (array) scandir( $dir ) as $item ) {
			if ( '.' === $item || '..' === $item ) {
				continue;
			}
			$path = $dir . '/' . $item;
			if ( is_dir( $path ) && ! is_link( $path ) ) {
				self::rrmdir( $path );
			} else {
				wp_delete_file( $path );
			}
		}
		@rmdir( $dir );
	}
}
