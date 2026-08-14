// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	devToolbar: { enabled: false },
	markdown: {
		shikiConfig: {
			// Tema basado en variables CSS: los colores del resaltado se definen
			// en src/styles/article.css reutilizando la paleta de global.css,
			// en vez de los hex fijos de un tema de Shiki (p. ej. github-dark).
			theme: 'css-variables',
			// LDIF no tiene gramática propia en Shiki; su sintaxis clave:valor
			// es suficientemente parecida a INI para un resaltado razonable.
			langAlias: { ldif: 'ini' },
		},
	},
});
