import { Flex } from "@orderly.network/ui";
import { withBasePath } from "@/utils/base-path";
import { Twitter, Send, MessageCircle } from "lucide-react";

const links = [
  { label: "Documentation", href: "https://doc.torodex.xyz/" },
  { label: "Governance", href: "https://torodex.xyz/" },
  { label: "Terms", href: "https://torodex.xyz/" },
];

const socials = [
  { icon: <Twitter size={16} />, href: "https://x.com/Toro_DEX", label: "Twitter" },
  { icon: <MessageCircle size={16} />, href: "https://discord.gg/haHUWK84", label: "Discord" },
  { icon: <Send size={16} />, href: "https://t.me/Toro_DEX", label: "Telegram" },
];

export default function ToroFooter() {
  return (
    <footer className="oui-border-t oui-border-base-200 oui-bg-background oui-text-base-contrast">
      <div className="oui-max-w-screen-2xl oui-mx-auto oui-px-4 oui-py-4">
        <Flex
          justify="between"
          itemAlign="center"
          className="oui-gap-4 oui-flex-wrap md:oui-flex-nowrap"
        >
          <Flex itemAlign="center" className="oui-gap-3 oui-min-w-[180px]">
            <img src={withBasePath("/logo.webp")} alt="Toro logo" className="oui-h-8" />
            <div className="oui-leading-tight">
              <div className="oui-text-base oui-font-semibold">Toro DEX</div>
              <div className="oui-text-2xs oui-text-base-contrast-54">Structured risk. Native speed.</div>
            </div>
          </Flex>

          <Flex
            justify="center"
            itemAlign="center"
            className="oui-gap-4 oui-flex-wrap md:oui-flex-nowrap oui-text-xs oui-uppercase oui-tracking-wide"
          >
            {links.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="oui-text-base-contrast-80 hover:oui-text-base-contrast"
              >
                {link.label}
              </a>
            ))}
          </Flex>

          <Flex
            justify="end"
            itemAlign="center"
            className="oui-gap-3 oui-flex-wrap md:oui-flex-nowrap"
          >
            <Flex itemAlign="center" className="oui-gap-2.5">
              {socials.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.label}
                  className="oui-w-9 oui-h-9 oui-rounded-lg oui-border oui-border-base-200 oui-flex oui-items-center oui-justify-center hover:oui-border-base-contrast hover:oui-text-base-contrast"
                >
                  {social.icon}
                </a>
              ))}
            </Flex>
            <span className="oui-text-2xs oui-text-base-contrast-54 oui-whitespace-nowrap">
              © 2025 Toro DEX · Built on Sei.
            </span>
          </Flex>
        </Flex>
      </div>
    </footer>
  );
}
