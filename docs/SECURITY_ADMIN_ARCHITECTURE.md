# АнаФикс Web: безопасность, организации, оплата и админ-панель

**Статус:** целевая архитектура + реализованный безопасный прототип  
**Дата:** 2026-09-30

## 1. Решение

АнаФикс строится как B2B multi-tenant система:

- платёжная единица — **организация**, а не отдельный врач;
- пользователь может состоять в организации с ролью `owner`, `admin`, `billing_admin` или `clinician`;
- `platform_admin` — отдельная глобальная роль владельца сервиса;
- медицинские данные всегда ограничены организацией и не показываются платформенному администратору по умолчанию;
- Stripe хранит платёжные реквизиты; приложение хранит только идентификаторы customer/subscription, тариф, статус и расчётные периоды;
- все чувствительные административные операции проверяются сервером и попадают в append-only audit log.

## 2. Аутентификация и авторизация

### Реализовано сейчас

- обязательный вход перед доступом к клиническому мастеру;
- подписанная сервером HttpOnly-сессия на 8 часов;
- cookie с `SameSite=Strict`, `Secure` в production и префиксом `__Host-`;
- роли `platform_admin`, `organization_owner`, `billing_admin`, `clinician`;
- серверная проверка роли на `/admin`;
- ограничение попыток входа и одинаковое сообщение при неверном логине/пароле;
- scrypt для bootstrap-пароля production-администратора;
- редактированный security audit без логинов, паролей, токенов и медицинских данных;
- fail-closed production-конфигурация: без secret и password hash вход невозможен.

Текущая bootstrap-аутентификация предназначена для разработки и первичного развёртывания. Production-цель — PostgreSQL database sessions и username-based аутентификация без обязательной электронной почты. Better Auth имеет username-plugin для входа, но его текущий signup API всё ещё требует email; поэтому библиотека не выбирается до проверки модели без email. Next.js рекомендует повторять authorization-проверку внутри каждой Server Action/Route Handler, а не полагаться только на UI или Proxy.

### Production target

- PostgreSQL-сессии и login/password без обязательного email;
- временный пароль с обязательной заменой при первом входе;
- TOTP 2FA для `platform_admin`, владельцев организаций и billing-admin;
- database sessions, отзыв всех сессий, trusted devices и журнал входов;
- модель organization/membership/roles с персональными учётными записями;
- Redis-backed rate limiting для горизонтального масштабирования;
- SSO/SCIM как Enterprise-функция после подтверждения спроса.

## 3. Модель административной панели

### Главный экран

1. KPI: организации, пользователи, активные подписки, MRR, успешность платежей.
2. График регулярной выручки без персональных и медицинских данных.
3. Операционные события: просрочки, заканчивающиеся trial, новые организации.
4. Таблица организаций с поиском, фильтром, статусом, тарифом, количеством пользователей и последней активностью.

Цвет не является единственным носителем статуса: каждый badge содержит текст. Поиск и фильтры применяются ко всему набору, после изменения фильтра пагинация должна возвращаться на первую страницу. Для длинных таблиц используются server-side pagination, стабильные URL без PHI и экспорт только после отдельного разрешения.

### Следующие разделы

- **Организации:** карточка организации, участники, роли, тариф, лимиты, история статусов.
- **Пользователи:** глобальный поиск, статус, 2FA, последняя сессия; без просмотра клинических записей.
- **Оплата:** MRR, trial, past due, churn, invoices; переход в Stripe Dashboard по provider ID.
- **Журнал:** входы, неуспешные authorization, смена ролей, приглашения, подписка и административные изменения.
- **Настройки:** тарифы, feature flags, уведомления и сроки хранения данных — только с повторной аутентификацией.

## 4. Оплата

Рекомендуемая начальная модель — фиксированный тариф организации с включённым числом мест, затем per-seat или graduated tiers при появлении фактических данных использования. Организация становится Stripe Customer. Checkout и Customer Portal размещаются у Stripe; приложение не принимает и не логирует номер карты.

Webhook — источник истины для статуса подписки:

1. проверить подпись на raw body;
2. сохранить provider event ID в idempotency ledger;
3. обработать событие транзакционно;
4. повторное событие вернуть как успешно обработанное без повторной мутации;
5. выдавать/отзывать entitlement только по подтверждённому состоянию подписки;
6. не удалять организацию с активной подпиской.

## 5. Базовый профиль безопасности

- OWASP ASVS 5.0 Level 2 как минимальная release-gate цель для системы с чувствительными данными;
- CSP с per-request nonce, запрет framing, MIME sniffing и лишних browser capabilities;
- TLS/HSTS в production;
- secrets только в secret manager, поддержка ротации;
- server-side validation и tenant authorization в DAL для каждого чтения/изменения;
- отсутствие PHI в URL, логах, аналитике, платёжных metadata и error monitoring;
- шифрование managed PostgreSQL и backup, документированное восстановление;
- dependency/SAST/secret scanning в CI, SBOM и регулярное обновление;
- отдельные production/staging окружения и разные ключи;
- re-authentication для смены ролей, платёжных настроек, экспорта и удаления;
- проверяемые retention/deletion policy и incident response plan;
- независимый pentest перед production-запуском и после крупных изменений auth/billing.

## 6. Источники и применённые выводы

- [OWASP ASVS 5.0](https://owasp.org/projects/asvs): выбран Level 2; охватывает authentication, sessions, access control, logging, data protection и configuration.
- [OWASP security events](https://cornucopia.owasp.org/taxonomy/asvs-5.0/16-security-logging-and-error-handling/03-security-events): логировать успешные/неуспешные входы и отказы авторизации без чувствительных payload.
- [Next.js Authentication](https://nextjs.org/docs/app/guides/authentication): библиотека аутентификации, DAL и проверка authorization внутри каждой серверной операции.
- [Better Auth Organizations](https://better-auth.com/docs/plugins/organization): membership, invitations и роли организации.
- [Better Auth Username](https://better-auth.com/docs/plugins/username): вход по username; текущий signup всё ещё содержит обязательный email.
- [Better Auth 2FA](https://better-auth.com/docs/plugins/2fa): TOTP, backup codes и trusted devices.
- [Better Auth Stripe](https://better-auth.com/docs/plugins/stripe): организация как Stripe Customer и запрет удаления организации с активной подпиской.
- [Stripe pricing models](https://docs.stripe.com/billing/subscriptions/metered-billing/thresholds): flat-rate, per-seat, tiered и usage-based варианты.
- [Carbon data table](https://carbondesignsystem.com/components/data-table/usage/): toolbar для глобального поиска, фильтров и действий таблицы.
- [GOV.UK pagination](https://design-system.service.gov.uk/components/pagination/): доступная пагинация и применение фильтра ко всему набору.

## 7. Release gates

Нельзя принимать реальные регистрации или платежи, пока не выполнены одновременно:

- username-based production auth + database sessions + 2FA для привилегированных ролей;
- PostgreSQL migrations, RLS/tenant tests и backup restore drill;
- Stripe test-mode webhook tests, idempotency и entitlement tests;
- audit sink, monitoring и alerting;
- privacy/terms/retention документы для выбранной юрисдикции;
- ASVS L2 checklist, dependency scan и внешний pentest.
