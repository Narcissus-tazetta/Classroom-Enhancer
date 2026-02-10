import { defineContentScript } from "wxt/utils/define-content-script";
import { ClassroomTextProcessor } from "./ClassroomTextProcessor";
import { DropdownSearchEnhancer } from "./DropdownSearchEnhancer";
import { DropdownUsageTracker } from "./DropdownUsageTracker";

export default defineContentScript({
    matches: ["https://classroom.google.com/*"],
    main() {
        new ClassroomTextProcessor();
        new DropdownSearchEnhancer();
        new DropdownUsageTracker();
    },
});
