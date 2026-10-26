# Reglas del backend — ERP EnterpriseCloud

Reglas obligatorias para todo el código de `erp-backend/`. Un cambio que incumpla una
regla no se da por terminado. Aplican a personas y a agentes por igual.

## 1. Stack fijo

| Área | Elección |
|---|---|
| Framework | NestJS (última versión estable) sobre Node.js 22+ |
| Gestor de paquetes | **pnpm** (nunca npm ni yarn): `pnpm-lock.yaml` versionado, `packageManager` fijado en `package.json`, sin `package-lock.json` |
| Lenguaje | TypeScript en modo `strict` (sin `any`, sin `@ts-ignore`) |
| ORM | Prisma (único acceso a la base de datos) |
| Base de datos | PostgreSQL 16+ |
| Validación | `class-validator` + `class-transformer` en DTOs, `ValidationPipe` global con `whitelist` y `forbidNonWhitelisted` |
| Autenticación | JWT (access corto + refresh), contraseñas con argon2 |
| Pruebas | Jest (unitarias e integración) + Supertest (e2e) |
| Calidad | ESLint con reglas tipadas + Prettier |
| Despliegue | Render (web service + PostgreSQL vía `render.yaml`) |

Todo vive dentro de `erp-backend/`. No se agregan dependencias sin justificar su necesidad.

## 2. Clean Architecture

Cada módulo de negocio (`src/modules/<grupo>/`) se divide en cuatro capas:

```
src/modules/<grupo>/
├── domain/          entidades, value objects, reglas puras, errores de dominio,
│                    interfaces de repositorio (puertos)
├── application/     casos de uso (un archivo por caso), DTOs de entrada/salida
├── infrastructure/  repositorios Prisma (adaptadores), mapeadores BD ↔ dominio
└── presentation/    controladores HTTP, DTOs de request, guardas, presentadores
```

Regla de dependencias (se valida con ESLint `import/no-restricted-paths` o equivalente):

- `domain` no importa nada de NestJS, Prisma ni de otras capas.
- `application` solo importa `domain` y `src/shared/application`.
- `infrastructure` implementa los puertos del dominio; es el único lugar donde se importa `@prisma/client`.
- `presentation` solo llama casos de uso; nunca a repositorios ni a Prisma.
- Un módulo no importa el interior de otro módulo: se comunica por su caso de uso exportado o por un puerto.

Código transversal en `src/shared/` (errores base, `Result`, paginación, transacción, auditoría,
reloj, generador de ids) con la misma división por capas.

## 3. SOLID

- **S** — Un caso de uso = una operación de negocio. Controladores sin lógica.
- **O** — Nuevos procesos (p. ej. un nuevo tipo de comprobante) se agregan con clases nuevas, no
  con `if/switch` crecientes sobre el tipo.
- **L** — Las implementaciones de un puerto (Prisma, en memoria para pruebas) son intercambiables.
- **I** — Puertos pequeños y específicos (`StockRepository`, `KardexWriter`), no repositorios genéricos gigantes.
- **D** — Los casos de uso dependen de interfaces inyectadas por token; nunca hacen `new` de infraestructura.

## 4. Cero deuda técnica

- Sin `TODO`, `FIXME`, código comentado, `console.log` ni archivos o dependencias sin usar.
- Sin duplicación: si una regla aparece dos veces, se extrae.
- Toda regla de negocio tiene prueba unitaria; todo endpoint tiene prueba e2e del caso feliz y de sus errores principales.
- Cobertura mínima: 90 % en `domain` y `application`.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` pasan sin errores ni advertencias
  antes de cerrar cualquier tarea.
- Nombres de código en inglés; mensajes al usuario en español, idénticos a los que ya muestra el frontend.
- Cada migración de Prisma tiene nombre descriptivo y nunca se edita una migración ya aplicada.

## 5. Contrato con el frontend

- El frontend está aprobado y **no se rediseña**. El backend se adapta a sus tipos (`erp-frontend/src/types`).
- Las respuestas JSON tienen la misma forma que los tipos del frontend (fechas ISO 8601, montos como número con 2 decimales).
- Errores con formato único: `{ "statusCode", "code", "message" }`, con `message` en español.
- API versionada: `/api/v1/...`. Documentada con Swagger (`/api/docs`) solo fuera de producción.

## 6. Datos y transacciones

- Dinero con `Decimal` (`@db.Decimal(14,2)`), nunca `float`. Cantidades con `Decimal(14,3)` si admiten fracción.
- Toda operación que toque más de una tabla (venta → stock → kardex → CxC → auditoría) corre en una
  sola transacción (`prisma.$transaction`, aislamiento adecuado). Si algo falla, no se guarda nada.
- Stock: actualización atómica con condición (`stock >= cantidad`) para evitar carreras; nunca negativo.
- Numeración correlativa por serie con bloqueo de fila o contador atómico; sin huecos ni duplicados.
- Anular no borra: cambia estado y revierte efectos. Los datos de negocio no se eliminan físicamente.
- Índices en toda FK y en los campos por los que se filtra o busca.

## 7. Seguridad

- Ninguna credencial, token ni `.env` en el repositorio; solo `.env.example` con valores ficticios.
- Configuración validada al arrancar (`@nestjs/config` + esquema); si falta una variable, la app no inicia.
- Contraseñas con argon2id; nunca se devuelven en respuestas ni se registran en logs.
- JWT firmado con secreto de entorno, expiración corta; refresh rotativo e invalidable.
- Autorización por recurso + acción (ver, crear, editar, anular, procesos) en el servidor, con la misma
  matriz de permisos por rol del frontend. Ocultar un botón en el frontend no es seguridad.
  - **Desviación aprobada (usuario, 2026-10-26):** la matriz del frontend es por módulo con nivel
    `none < read < write`, y el servidor aplica esa misma matriz. Las acciones de escritura y de proceso
    piden `write` en su módulo. Los permisos por acción (RNF-06) quedan fuera del alcance.
- `helmet`, CORS restringido al origen del frontend, rate limit en login (`@nestjs/throttler`).
- Validación y saneamiento de toda entrada; consultas solo vía Prisma (sin SQL interpolado).
- Archivos subidos: tamaño máximo, tipos permitidos y nombre generado por el servidor.
- Logs estructurados sin datos sensibles; errores internos nunca exponen trazas al cliente.
- Toda acción de escritura queda en la auditoría (usuario, fecha, acción, recurso, id).

## 8. Optimización

- Listados siempre paginados en el servidor, con `select` explícito (sin traer columnas que no se usan).
- Sin consultas N+1: usar `include`/`select` anidados o consultas agregadas.
- Dashboard y reportes con agregaciones en la base (`groupBy`, `aggregate` o SQL tipado), no en memoria.
- Compresión HTTP activada; respuestas sin campos innecesarios.
- Conexiones Prisma reutilizadas (un solo `PrismaService`); cierre limpio al apagar.

## 9. Flujo de trabajo

- Cada fase del plan (`../plaing/PLAN-BACKEND.md`) termina con lint, tipos, pruebas y build en verde.
- Un agente trabaja sobre los archivos de su fase; no modifica los de otra fase sin coordinación.
- El esquema Prisma es la fuente de verdad del modelo de datos.
