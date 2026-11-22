<?php

namespace N15\Flipbook;

defined( 'ABSPATH' ) || exit;

final class Frontend {
	const MODULE = '@3n15-flipbook/flipbook';
	const FRAME  = array(
		'spread' => array( 2.16, 1.22 ),
		'single' => array( 1.06, 1.14 ),
	);

	private static $instance = 0;

	public static function init() {
		add_action( 'init', array( __CLASS__, 'register_assets' ) );
		add_action( 'init', array( __CLASS__, 'register_shortcodes' ), 20 );

		add_filter( 'rocket_delay_js_exclusions', array( __CLASS__, 'optimizer_exclusions' ) );
		add_filter( 'rocket_exclude_js', array( __CLASS__, 'optimizer_exclusions' ) );
		add_filter( 'rocket_exclude_defer_js', array( __CLASS__, 'optimizer_exclusions' ) );
	}

	public static function register_assets() {
		$js = N15FB_URL . 'assets/js/';
		wp_register_script_module( '@3n15-flipbook/math', $js . 'math.js', array(), VERSION );
		wp_register_script_module( '@3n15-flipbook/renderer', $js . 'renderer.js', array( '@3n15-flipbook/math' ), VERSION );
		wp_register_script_module( self::MODULE, $js . 'flipbook.js', array( '@3n15-flipbook/renderer' ), VERSION );
		wp_register_style( 'n15fb', N15FB_URL . 'assets/css/flipbook.css', array(), VERSION );
	}

	public static function register_shortcodes() {
		add_shortcode( Plugin::SHORTCODE, array( __CLASS__, 'shortcode' ) );
	}

	public static function shortcode( $atts ) {
		$atts = shortcode_atts( array( 'id' => '' ), $atts, Plugin::SHORTCODE );
		$post = Plugin::find( $atts['id'] );
		if ( ! $post ) {
			return self::editor_notice( sprintf( __( 'Flipbook „%s“ nicht gefunden.', '3n15-flipbook' ), $atts['id'] ) );
		}
		return self::render( $post );
	}

	private static function editor_notice( $text ) {
		return current_user_can( 'edit_posts' ) ? '<p class="n15fb-notice"><em>3N15 Flipbook: ' . esc_html( $text ) . '</em></p>' : '';
	}

	public static function render( \WP_Post $post ) {
		$book = Plugin::get_book( $post->ID );
		if ( empty( $book['pages'] ) || ! Storage::is_valid_set( $book['set'] ) ) {
			return self::editor_notice( __( 'Für dieses Flipbook wurden noch keine Seiten erzeugt.', '3n15-flipbook' ) );
		}
		$o     = Plugin::get_options( $post->ID );
		$base  = Storage::set_url( $post->ID, $book['set'] );
		$title = get_the_title( $post );
		$uid   = 'n15fb-' . $post->ID . '-' . ( ++self::$instance );
		$count = count( $book['pages'] );

		$pages = array();
		foreach ( $book['pages'] as $p ) {
			$pages[] = array(
				'src' => $base . '/' . $p['f'],
				'w'   => (int) $p['w'],
				'h'   => (int) $p['h'],
			);
		}

		$first = $pages[0];
		$ph    = $first['w'] && $first['h'] ? $first['h'] / $first['w'] : 1.414;
		$wide  = self::FRAME['spread'];
		$tall  = self::FRAME['single'];
		$ar    = round( $wide[0] / ( $ph * $wide[1] ), 4 );
		$ar_s  = round( $tall[0] / ( $ph * $tall[1] ), 4 );

		$pdf = ( $o['download'] && $book['pdf_id'] ) ? wp_get_attachment_url( $book['pdf_id'] ) : '';

		$config = array(
			'pages' => $pages,
			'curl'  => Plugin::curl_factor( $o['curl'] ),
			'frame' => self::FRAME,
			'i18n'  => array(
				'pageOf'     => __( '%1$s von %2$s', '3n15-flipbook' ),
				'fullscreen' => __( 'Vollbild', '3n15-flipbook' ),
				'exitFull'   => __( 'Vollbild beenden', '3n15-flipbook' ),
			),
		);

		wp_enqueue_style( 'n15fb' );
		wp_enqueue_script_module( self::MODULE );

		$accent = sanitize_hex_color( $o['accent'] );
		$style  = sprintf(
			'--n15fb-accent:%1$s;--n15fb-max:%2$dpx;--n15fb-ar:%3$s;--n15fb-ar-s:%4$s;--n15fb-page-h:%5$s%%;--n15fb-page-h-s:%6$s%%',
			$accent ? $accent : Plugin::default_options()['accent'],
			(int) $o['max_width'],
			$ar,
			$ar_s,
			round( 100 / $wide[1], 3 ),
			round( 100 / $tall[1], 3 )
		);

		ob_start();
		?>
		<section class="n15fb" id="<?php echo esc_attr( $uid ); ?>" style="<?php echo esc_attr( $style ); ?>" data-state="html" aria-roledescription="<?php esc_attr_e( 'Flipbook', '3n15-flipbook' ); ?>" aria-label="<?php echo esc_attr( $title ); ?>" tabindex="0">
			<div class="n15fb-stage">
				<ol class="n15fb-pages">
					<?php foreach ( $pages as $i => $p ) : ?>
						<li class="n15fb-page" data-i="<?php echo (int) $i; ?>" <?php echo 0 === $i ? 'data-show' : ''; ?>>
							<img src="<?php echo esc_url( $p['src'] ); ?>" width="<?php echo (int) $p['w']; ?>" height="<?php echo (int) $p['h']; ?>" alt="<?php echo esc_attr( sprintf( __( 'Seite %d', '3n15-flipbook' ), $i + 1 ) ); ?>" decoding="async" <?php echo 0 === $i ? '' : 'loading="lazy"'; ?>>
						</li>
					<?php endforeach; ?>
				</ol>
				<p class="n15fb-hint" aria-hidden="true">
					<span class="n15fb-hint-fine"><?php esc_html_e( 'Seite ziehen oder klicken', '3n15-flipbook' ); ?></span>
					<span class="n15fb-hint-coarse"><?php esc_html_e( 'Wischen zum Blättern', '3n15-flipbook' ); ?></span>
				</p>
				<div class="n15fb-error" role="alert" hidden>
					<?php echo self::icon( 'alert' ); ?>
					<span><?php esc_html_e( 'Einige Seiten konnten nicht geladen werden.', '3n15-flipbook' ); ?></span>
					<button type="button" class="n15fb-btn n15fb-outline" data-act="retry"><?php esc_html_e( 'Erneut versuchen', '3n15-flipbook' ); ?></button>
				</div>
				<button type="button" class="n15fb-arrow n15fb-arrow-prev" data-act="prev" tabindex="-1" aria-hidden="true"><?php echo self::icon( 'prev' ); ?></button>
				<button type="button" class="n15fb-arrow n15fb-arrow-next" data-act="next" tabindex="-1" aria-hidden="true"><?php echo self::icon( 'next' ); ?></button>
			</div>

			<div class="n15fb-bar" role="group" aria-label="<?php esc_attr_e( 'Flipbook-Steuerung', '3n15-flipbook' ); ?>">
				<?php if ( $o['overview'] ) : ?>
					<button type="button" class="n15fb-btn n15fb-has-label" data-act="overview" data-tip="<?php esc_attr_e( 'Übersicht', '3n15-flipbook' ); ?>" aria-haspopup="dialog" aria-controls="<?php echo esc_attr( $uid ); ?>-dialog">
						<?php echo self::icon( 'grid' ); ?>
						<span class="n15fb-label"><?php esc_html_e( 'Übersicht', '3n15-flipbook' ); ?></span>
					</button>
					<span class="n15fb-sep" aria-hidden="true"></span>
				<?php endif; ?>
				<button type="button" class="n15fb-btn n15fb-wide-only" data-act="first" aria-label="<?php esc_attr_e( 'Erste Seite', '3n15-flipbook' ); ?>" data-tip="<?php esc_attr_e( 'Erste Seite', '3n15-flipbook' ); ?>"><?php echo self::icon( 'first' ); ?></button>
				<button type="button" class="n15fb-btn" data-act="prev" aria-label="<?php esc_attr_e( 'Vorherige Seite', '3n15-flipbook' ); ?>" data-tip="<?php esc_attr_e( 'Zurück', '3n15-flipbook' ); ?>"><?php echo self::icon( 'prev' ); ?></button>
				<span class="n15fb-count" aria-live="polite" aria-atomic="true"><?php echo esc_html( sprintf( __( '%1$s von %2$s', '3n15-flipbook' ), '1', (string) $count ) ); ?></span>
				<button type="button" class="n15fb-btn" data-act="next" aria-label="<?php esc_attr_e( 'Nächste Seite', '3n15-flipbook' ); ?>" data-tip="<?php esc_attr_e( 'Weiter', '3n15-flipbook' ); ?>"><?php echo self::icon( 'next' ); ?></button>
				<button type="button" class="n15fb-btn n15fb-wide-only" data-act="last" aria-label="<?php esc_attr_e( 'Letzte Seite', '3n15-flipbook' ); ?>" data-tip="<?php esc_attr_e( 'Letzte Seite', '3n15-flipbook' ); ?>"><?php echo self::icon( 'last' ); ?></button>
				<span class="n15fb-sep" aria-hidden="true"></span>
				<button type="button" class="n15fb-btn n15fb-has-label" data-act="fullscreen" data-tip="<?php esc_attr_e( 'Vollbild', '3n15-flipbook' ); ?>">
					<?php echo self::icon( 'expand' ); ?>
					<?php echo self::icon( 'shrink' ); ?>
					<span class="n15fb-label"><?php esc_html_e( 'Vollbild', '3n15-flipbook' ); ?></span>
				</button>
				<?php if ( $pdf ) : ?>
					<a class="n15fb-btn n15fb-primary n15fb-has-label" href="<?php echo esc_url( $pdf ); ?>" download data-tip="<?php esc_attr_e( 'PDF herunterladen', '3n15-flipbook' ); ?>">
						<?php echo self::icon( 'download' ); ?>
						<span class="n15fb-label"><?php esc_html_e( 'PDF', '3n15-flipbook' ); ?></span>
					</a>
				<?php endif; ?>
				<span class="n15fb-progress" aria-hidden="true"><span></span></span>
			</div>

			<?php if ( $o['overview'] ) : ?>
				<dialog class="n15fb-dialog" id="<?php echo esc_attr( $uid ); ?>-dialog" aria-labelledby="<?php echo esc_attr( $uid ); ?>-dialog-title">
					<div class="n15fb-dialog-head">
						<h2 id="<?php echo esc_attr( $uid ); ?>-dialog-title"><?php esc_html_e( 'Seitenübersicht', '3n15-flipbook' ); ?></h2>
						<button type="button" class="n15fb-btn n15fb-outline" data-act="close"><?php echo self::icon( 'close' ); ?><?php esc_html_e( 'Schließen', '3n15-flipbook' ); ?></button>
					</div>
					<ol class="n15fb-grid">
						<?php foreach ( $book['pages'] as $i => $p ) : ?>
							<li>
								<button type="button" class="n15fb-thumb" data-page="<?php echo (int) $i; ?>">
									<img src="<?php echo esc_url( $base . '/' . $p['t'] ); ?>" alt="" width="<?php echo (int) $p['w']; ?>" height="<?php echo (int) $p['h']; ?>" loading="lazy" decoding="async">
									<span>
										<?php
										echo esc_html( sprintf( __( 'Seite %d', '3n15-flipbook' ), $i + 1 ) );
										?>
									</span>
								</button>
							</li>
						<?php endforeach; ?>
					</ol>
				</dialog>
			<?php endif; ?>

			<script type="application/json" class="n15fb-config"><?php echo wp_json_encode( $config, JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ); ?></script>
		</section>
		<?php
		return trim( (string) ob_get_clean() );
	}

	private static function icon( $name ) {
		$paths = array(
			'prev'     => '<path d="M19 12H5M11 6l-6 6 6 6"/>',
			'next'     => '<path d="M5 12h14M13 6l6 6-6 6"/>',
			'first'    => '<path d="M5 5v14M19 12H9M14 7l-5 5 5 5"/>',
			'last'     => '<path d="M19 5v14M5 12h10M10 7l5 5-5 5"/>',
			'grid'     => '<path d="M4 4h4v4H4zM10 4h4v4h-4zM16 4h4v4h-4zM4 10h4v4H4zM10 10h4v4h-4zM16 10h4v4h-4zM4 16h4v4H4zM10 16h4v4h-4zM16 16h4v4h-4z"/>',
			'expand'   => '<path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7"/>',
			'shrink'   => '<path d="M20 10h-6V4M14 10l6-6M4 14h6v6M10 14l-6 6"/>',
			'download' => '<path d="M12 3v12M7 10l5 5 5-5M4 17v3h16v-3"/>',
			'close'    => '<path d="M6 6l12 12M18 6L6 18"/>',
			'alert'    => '<path d="M12 8v5M12 16.5v.01"/><circle cx="12" cy="12" r="9"/>',
		);
		return '<svg class="n15fb-icon n15fb-icon-' . $name . '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' . $paths[ $name ] . '</svg>';
	}

	public static function optimizer_exclusions( $list ) {
		$list   = (array) $list;
		$path   = wp_parse_url( N15FB_URL, PHP_URL_PATH );
		$list[] = $path . '(.*)';
		$list[] = '@3n15-flipbook';
		return $list;
	}
}
