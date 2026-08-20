import { ButtonLink } from '@/components/ButtonLink';
import { ChipList } from '@/components/ChipList';
import { TitleStroke } from '@/components/Decor';
import { Section } from '@/components/Section';
import { menuAccent } from '@/components/menu/accents';
import { MENU_PRICE_NOTE, MENU_SECTIONS } from '@/data/menu';

/** The sections the home page previews — the data marks the rest `highlight: false`. */
const HIGHLIGHTS = MENU_SECTIONS.filter((section) => section.highlight !== false);

/** "Menu highlights" — a short preview of the menu with a link to the full page. */
export function MenuHighlights() {
  return (
    <Section
      eyebrow="From the counter"
      title="Menu highlights"
      lead="Fried, baked and brewed fresh every day. The full list — including cold drinks — is on the menu page."
      width="6xl"
    >
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {HIGHLIGHTS.map((section) => {
          const toppings = section.toppings ?? [];
          const featured = toppings.length > 0;

          return (
            <li
              key={section.id}
              className={`relative rounded-3xl p-6 shadow-card transition duration-300 ease-out motion-safe:hover:-translate-y-1 hover:shadow-lift ${
                featured
                  ? 'bg-gradient-to-br from-snow to-wheat/20 ring-2 ring-wheat sm:col-span-2 lg:col-span-3 sm:p-8'
                  : 'bg-snow ring-1 ring-bark/10'
              }`}
            >
              {featured ? (
                <p className="absolute -top-3 left-6 rounded-full bg-wheat px-3 py-1 text-xs font-black tracking-[0.14em] text-bark uppercase shadow-press">
                  House specialty
                </p>
              ) : null}

              <h3 className={`font-black text-bark ${featured ? 'text-2xl' : 'text-xl'}`}>
                {section.name}
              </h3>
              {/* The same accent this section answers with on the menu page. */}
              <TitleStroke className={`mt-1.5 h-1.5 w-12 ${menuAccent(section.id).stroke}`} />

              {section.description ? (
                <p className="mt-2 text-bark/85">{section.description}</p>
              ) : null}

              {featured ? (
                <>
                  <p className="mt-5 text-sm font-bold tracking-wide text-bark/70 uppercase">
                    Toppings
                  </p>
                  <ChipList items={toppings} className="mt-2" />
                </>
              ) : (
                <p className="mt-3 text-sm font-semibold text-bark/70">
                  {section.items.map((item) => item.name).join(' · ')}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-10 flex flex-wrap items-center gap-4">
        <ButtonLink href="/menu/">See the full menu</ButtonLink>
        <p className="text-bark/75">{MENU_PRICE_NOTE}</p>
      </div>
    </Section>
  );
}
