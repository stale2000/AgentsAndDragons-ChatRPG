import { ChatWindow } from "@/components/ChatWindow";
import { GuideInfoBox } from "@/components/guide/GuideInfoBox";
import { StateSidebar } from "@/components/StateSidebar";

export default function RulesEnginePage() {
  const InfoCard = (
    <GuideInfoBox>
      <ul>
        <li className="text-l">
          🎲
          <span className="ml-2">
            This page integrates with the <strong>ChatRPG backend</strong> rules engine,
            providing access to 50+ D&D 5e tools for accurate game mechanics.
          </span>
        </li>
        <li>
          ⚔️
          <span className="ml-2">
            The AI agent can create characters, manage combat encounters, roll dice,
            handle spells, and more - all using the authoritative backend rules engine.
          </span>
        </li>
        <li className="hidden text-l md:block">
          🔧
          <span className="ml-2">
            Backend integration logic is in{" "}
            <code>app/api/chat/rules_engine/route.ts</code> and{" "}
            <code>utils/rulesEngineClient.ts</code>.
          </span>
        </li>
        <li>
          📋
          <span className="ml-2">
            Available tool categories: Character Management, Combat System, Magic System,
            Spatial Mechanics, World & Session, and Dice Rolling.
          </span>
        </li>
        <li className="hidden text-l md:block">
          💻
          <span className="ml-2">
            The frontend page is at <code>app/rules_engine/page.tsx</code>.
          </span>
        </li>
        <li className="text-l">
          👇
          <span className="ml-2">
            Try asking: <code>Create a level 5 halfling rogue named Finn</code> or{" "}
            <code>Roll 4d6 drop lowest for ability scores</code>
          </span>
        </li>
      </ul>
    </GuideInfoBox>
  );

  return (
    <div className="flex h-screen">
      <div className="flex-1 relative">
        <ChatWindow
          endpoint="api/chat/rules_engine"
          emptyStateComponent={InfoCard}
          placeholder="Ask me to create a character, roll dice, start combat, or use any D&D 5e mechanics!"
          emoji="🎲"
          showIntermediateStepsToggle={true}
        />
      </div>
      <StateSidebar />
    </div>
  );
}

