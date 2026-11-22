<?php

namespace N15\Flipbook;

defined( 'ABSPATH' ) || exit;

final class Admin {
	const PDFJS_VERSION = '4.10.38';
	const RENDER_WIDTH  = 1800;
	const THUMB_WIDTH   = 360;

	public static function init() {
		add_action( 'add_meta_boxes_' . Plugin::CPT, array( __CLASS__, 'meta_boxes' ) );
		add_action( 'save_post_' . Plugin::CPT, array( __CLASS__, 'save' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'assets' ) );
		add_filter( 'manage_' . Plugin::CPT . '_posts_columns', array( __CLASS__, 'columns' ) );
		add_action( 'manage_' . Plugin::CPT . '_posts_custom_column', array( __CLASS__, 'column_content' ), 10, 2 );
	}

	public static function columns( $cols ) {
		$new = array();
		foreach ( $cols as $k => $v ) {
			$new[ $k ] = $v;
			if ( 'title' === $k ) {
				$new['n15fb_pages']     = __( 'Seiten', '3n15-flipbook' );
				$new['n15fb_shortcode'] = __( 'Shortcode', '3n15-flipbook' );
			}
		}
		return $new;
	}

	public static function column_content( $col, $post_id ) {
		if ( 'n15fb_pages' === $col ) {
			echo esc_html( (string) count( Plugin::get_book( $post_id )['pages'] ) );
		} elseif ( 'n15fb_shortcode' === $col ) {
			echo '<code>' . esc_html( Plugin::shortcode_for( $post_id ) ) . '</code>';
		}
	}

	public static function meta_boxes() {
		add_meta_box( 'n15fb-pages', __( 'Dokument', '3n15-flipbook' ), array( __CLASS__, 'box_pages' ), Plugin::CPT, 'normal', 'high' );
		add_meta_box( 'n15fb-embed', __( 'Shortcode', '3n15-flipbook' ), array( __CLASS__, 'box_embed' ), Plugin::CPT, 'side', 'default' );
		add_meta_box( 'n15fb-options', __( 'Darstellung', '3n15-flipbook' ), array( __CLASS__, 'box_options' ), Plugin::CPT, 'side', 'low' );
		remove_meta_box( 'slugdiv', Plugin::CPT, 'normal' );
	}

	public static function box_pages( $post ) {
		$book  = Plugin::get_book( $post->ID );
		$has   = ! empty( $book['pages'] );
		$url   = $has ? Storage::set_url( $post->ID, $book['set'] ) : '';
		$count = count( $book['pages'] );
		?>
		<div id="n15fb-admin" class="n15fb-admin" data-post="<?php echo esc_attr( (string) $post->ID ); ?>" data-state="<?php echo $has ? 'done' : 'empty'; ?>">
			<div class="n15fb-drop" id="n15fb-drop" role="button" tabindex="0" aria-describedby="n15fb-drop-hint">
				<span class="n15fb-drop-icon" aria-hidden="true">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 18v-6M9 14.5l3-3 3 3"/></svg>
				</span>
				<p class="n15fb-drop-title">
					<span class="n15fb-drop-idle"><?php echo $has ? esc_html__( 'Neues PDF hierher ziehen', '3n15-flipbook' ) : esc_html__( 'PDF hierher ziehen', '3n15-flipbook' ); ?></span>
					<span class="n15fb-drop-active"><?php esc_html_e( 'Loslassen, um die Umwandlung zu starten', '3n15-flipbook' ); ?></span>
				</p>
				<p class="n15fb-drop-sub"><?php esc_html_e( 'oder klicken, um eine Datei vom Computer zu wählen', '3n15-flipbook' ); ?></p>
				<div class="n15fb-drop-actions">
					<button type="button" class="button" id="n15fb-pick"><?php esc_html_e( 'Aus der Mediathek', '3n15-flipbook' ); ?></button>
				</div>
				<p class="n15fb-drop-hint" id="n15fb-drop-hint">
					<?php
					echo esc_html( sprintf( __( 'Nur PDF, bis %s. Ein bestehendes Flipbook bleibt online, bis alle neuen Seiten fertig sind.', '3n15-flipbook' ), size_format( wp_max_upload_size() ) ) );
					?>
				</p>
				<input type="file" id="n15fb-file" accept="application/pdf" hidden>
			</div>

			<div class="n15fb-job" id="n15fb-job" hidden>
				<div class="n15fb-job-head">
					<span class="n15fb-job-icon" aria-hidden="true">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>
					</span>
					<div class="n15fb-job-title">
						<strong id="n15fb-job-file"></strong>
						<span id="n15fb-job-step" aria-live="polite"></span>
					</div>
					<span class="n15fb-job-pct" id="n15fb-job-pct" aria-hidden="true">0 %</span>
					<button type="button" class="button" id="n15fb-cancel"><?php esc_html_e( 'Abbrechen', '3n15-flipbook' ); ?></button>
				</div>
				<div class="n15fb-meter" id="n15fb-meter-wrap" role="progressbar" aria-labelledby="n15fb-job-step" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="n15fb-meter"></span></div>
				<div class="n15fb-job-meta">
					<span id="n15fb-job-count"></span>
					<span id="n15fb-eta"></span>
				</div>
			</div>

			<div id="n15fb-notice" role="alert"></div>

			<div class="n15fb-summary" id="n15fb-summary" <?php echo $has ? '' : 'hidden'; ?>>
				<div class="n15fb-summary-head">
					<strong id="n15fb-summary-count"><?php echo esc_html( sprintf( _n( '%d Seite', '%d Seiten', $count, '3n15-flipbook' ), $count ) ); ?></strong>
					<span id="n15fb-summary-meta">
						<?php
						if ( $has ) {
							echo esc_html( ( $book['pdf_name'] ? $book['pdf_name'] . ' · ' : '' ) . $book['pages'][0]['w'] . ' × ' . $book['pages'][0]['h'] . ' px' );
						}
						?>
					</span>
				</div>
				<ol class="n15fb-tiles" id="n15fb-tiles">
					<?php foreach ( $book['pages'] as $i => $p ) : ?>
						<li class="is-done">
							<span class="n15fb-tile"><img src="<?php echo esc_url( $url . '/' . $p['t'] ); ?>" alt="" loading="lazy" width="<?php echo esc_attr( (string) $p['w'] ); ?>" height="<?php echo esc_attr( (string) $p['h'] ); ?>"></span>
							<span class="n15fb-tile-label"><?php echo 0 === $i ? esc_html__( 'Cover', '3n15-flipbook' ) : esc_html( (string) ( $i + 1 ) ); ?></span>
						</li>
					<?php endforeach; ?>
				</ol>
			</div>
		</div>
		<?php
	}

	public static function box_embed( $post ) {
		$sc = Plugin::shortcode_for( $post->ID );
		?>
		<p><label for="n15fb-shortcode"><?php esc_html_e( 'Auf einer Seite oder in einem Beitrag einsetzen:', '3n15-flipbook' ); ?></label></p>
		<div class="n15fb-copy">
			<input type="text" readonly value="<?php echo esc_attr( $sc ); ?>" id="n15fb-shortcode" class="code">
			<button type="button" class="button" id="n15fb-copy"><span><?php esc_html_e( 'Kopieren', '3n15-flipbook' ); ?></span></button>
		</div>
		<p class="n15fb-copy-status" id="n15fb-copy-status" aria-live="polite"></p>
		<?php
	}

	public static function box_options( $post ) {
		$o = Plugin::get_options( $post->ID );
		wp_nonce_field( 'n15fb_save_options', 'n15fb_options_nonce' );
		?>
		<p><label><input type="checkbox" name="n15fb[download]" value="1" <?php checked( $o['download'], 1 ); ?>> <?php esc_html_e( 'Download-Button für das PDF', '3n15-flipbook' ); ?></label></p>
		<p><label><input type="checkbox" name="n15fb[overview]" value="1" <?php checked( $o['overview'], 1 ); ?>> <?php esc_html_e( 'Seitenübersicht', '3n15-flipbook' ); ?></label></p>
		<p>
			<label for="n15fb-accent"><?php esc_html_e( 'Akzentfarbe', '3n15-flipbook' ); ?></label><br>
			<input type="text" id="n15fb-accent" name="n15fb[accent]" value="<?php echo esc_attr( $o['accent'] ); ?>" class="n15fb-color" data-default-color="#2450D0">
		</p>
		<p>
			<label for="n15fb-max-width"><?php esc_html_e( 'Breite höchstens (px)', '3n15-flipbook' ); ?></label><br>
			<input type="number" id="n15fb-max-width" min="480" max="2000" step="20" name="n15fb[max_width]" value="<?php echo esc_attr( (string) $o['max_width'] ); ?>" class="widefat">
		</p>
		<p>
			<label for="n15fb-curl"><?php esc_html_e( 'Wölbung beim Blättern', '3n15-flipbook' ); ?></label><br>
			<select id="n15fb-curl" name="n15fb[curl]" class="widefat">
				<?php
				$levels = array(
					'flat'    => __( 'Flach', '3n15-flipbook' ),
					'soft'    => __( 'Dezent', '3n15-flipbook' ),
					'natural' => __( 'Natürlich', '3n15-flipbook' ),
					'strong'  => __( 'Kräftig', '3n15-flipbook' ),
				);
				foreach ( $levels as $key => $label ) :
					?>
					<option value="<?php echo esc_attr( $key ); ?>" <?php selected( $o['curl'], $key ); ?>><?php echo esc_html( $label ); ?></option>
				<?php endforeach; ?>
			</select>
		</p>
		<?php
	}

	public static function save( $post_id ) {
		if ( ! isset( $_POST['n15fb_options_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['n15fb_options_nonce'] ) ), 'n15fb_save_options' ) ) {
			return;
		}
		if ( ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) || wp_is_post_revision( $post_id ) || ! current_user_can( 'edit_post', $post_id ) ) {
			return;
		}

		$in = isset( $_POST['n15fb'] ) && is_array( $_POST['n15fb'] ) ? wp_unslash( $_POST['n15fb'] ) : array();
		Plugin::set_options( $post_id, $in );
	}

	public static function assets( $hook ) {
		$screen = get_current_screen();
		if ( ! $screen || Plugin::CPT !== $screen->post_type || ! in_array( $hook, array( 'post.php', 'post-new.php' ), true ) ) {
			return;
		}
		wp_enqueue_media();
		wp_enqueue_style( 'wp-color-picker' );
		wp_enqueue_style( 'n15fb-admin', N15FB_URL . 'assets/css/admin.css', array(), VERSION );
		wp_enqueue_script(
			'n15fb-admin',
			N15FB_URL . 'assets/js/admin.js',
			array( 'jquery', 'wp-color-picker', 'wp-api-fetch', 'wp-i18n' ),
			VERSION,
			true
		);
		wp_set_script_translations( 'n15fb-admin', '3n15-flipbook', N15FB_DIR . 'languages' );
		wp_localize_script(
			'n15fb-admin',
			'N15FB_ADMIN',
			array(
				'pdfjs'      => N15FB_URL . 'assets/vendor/pdfjs/pdf.min.js?ver=' . self::PDFJS_VERSION,
				'worker'     => N15FB_URL . 'assets/vendor/pdfjs/pdf.worker.min.js?ver=' . self::PDFJS_VERSION,
				'restBase'   => '/' . Rest::NS,
				'width'      => max( 800, min( 4000, (int) apply_filters( 'n15fb_render_width', self::RENDER_WIDTH ) ) ),
				'thumbWidth' => self::THUMB_WIDTH,
				'quality'    => 0.82,
				'maxUpload'  => wp_max_upload_size(),
				'restUrl'    => esc_url_raw( rest_url( 'wp/v2/media' ) ),
				'nonce'      => wp_create_nonce( 'wp_rest' ),
			)
		);
	}
}
