/**
 * Landing page localization — registers a dedicated `landing` namespace on
 * top of the shared i18next instance the autlas app already initialized in
 * `./app/i18n`. Sharing the instance means toggling the language in the
 * landing also switches the embedded autlas app inside <AutlasFrame />.
 */
import i18n from "./app/i18n";
import landingEn from "./locales/landing-en.json";
import landingRu from "./locales/landing-ru.json";

i18n.addResourceBundle("en", "landing", landingEn, true, true);
i18n.addResourceBundle("ru", "landing", landingRu, true, true);

export default i18n;
