# Rubén Ferrer — Portfolio

Portfolio profesional de un especialista en ciberseguridad y sistemas, construido con Astro.

## Stack

- **Astro** (generación estática, `output: "static"`), sin backend ni base de datos.
- **HTML/CSS** — sistema de diseño propio en `src/styles/global.css` (variables de color, tipografía y espaciado), sin frameworks CSS.
- **Content collections** de Astro para los datos que cambian con el tiempo: `projects`, `experience`, `certifications` (esquemas en `src/content.config.ts`).

## Estructura del proyecto

```text
src/
├── content/
│   ├── projects/         # un .md por proyecto (ver sección de abajo)
│   ├── experience/       # un .md por puesto de trabajo
│   └── certifications/   # un .md por título/certificación
├── content.config.ts     # esquemas zod de las tres colecciones
├── layouts/
│   └── BaseLayout.astro  # navbar, footer, scroll-spy — envuelve todas las páginas
├── pages/
│   ├── index.astro       # home: Hero, Sobre mí, Experiencia, Skills, CTF, Proyectos, Certificados
│   └── projects/
│       └── [...slug].astro  # página individual de cada proyecto (renderiza el Markdown)
└── styles/
    ├── global.css        # sistema de diseño de la home (variables, componentes)
    └── article.css        # tipografía y estilos del contenido Markdown de un proyecto

public/
└── images/                # imágenes estáticas referenciadas por rutas absolutas (/images/...)
```

## Cómo añadir un proyecto nuevo

1. Crea un archivo en `src/content/projects/<slug>.md`. El nombre del archivo es el slug de la URL final (`/projects/<slug>/`).
2. Rellena el front matter:

   ```yaml
   ---
   title: "Nombre del proyecto"
   stack: ["Herramienta A", "Herramienta B"]
   summary: "Resumen de una línea para la card de la home."
   date: 2026-01-15
   draft: true
   repoUrl: "https://github.com/brean-rb/repo"   # opcional
   ---
   ```

3. Escribe el contenido en Markdown debajo del front matter — títulos (`##`/`###`), listas, tablas, bloques de código con lenguaje (` ```bash `) e imágenes (`![alt](/images/...)`, el `alt` se usa como pie de figura). El renderizado (bloques de código con resaltado y botón copiar, tablas con scroll, imágenes con marco/caption) ya está resuelto en `article.css` — no hay que tocar CSS por cada proyecto nuevo.
4. Mientras `draft: true`, el proyecto aparece en la home como card con "Próximamente" y sin página propia. En cuanto cambias a `draft: false`, `npm run build`/`npm run dev` generan automáticamente `/projects/<slug>/` y la card enlaza a ella.
5. `experience` y `certifications` siguen el mismo patrón (archivo `.md` con front matter, sin cuerpo necesario) — consulta `content.config.ts` para el esquema exacto de cada una.

## Desarrollo local

```bash
npm install       # instalar dependencias
npm run dev        # servidor local en http://localhost:4321
npm run build       # build de producción en ./dist/
```
