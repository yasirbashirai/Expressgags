/**
 * Registry of platform modules (each owns src/server/modules/<name>/). Mounted by app.ts.
 */
import type { PlatformModule } from "./types";
import { platformModule as orders } from "./orders";
import { platformModule as dispatch } from "./dispatch";
import { platformModule as driver } from "./driver";
import { platformModule as tracking } from "./tracking";
import { platformModule as team } from "./team";
import { platformModule as fleet } from "./fleet";
import { platformModule as users } from "./users";
import { platformModule as customer } from "./customer";
import { platformModule as quotations } from "./quotations";
import { platformModule as billing } from "./billing";
import { platformModule as carriers } from "./carriers";
import { platformModule as storage } from "./storage";
import { platformModule as protection } from "./protection";
import { platformModule as notifications } from "./notifications";
import { platformModule as cms } from "./cms";
import { platformModule as assistant } from "./assistant";
import { platformModule as reports } from "./reports";
import { platformModule as reference } from "./reference";

export const platformModules: PlatformModule[] = [orders, dispatch, driver, tracking, team, fleet, users, customer, quotations, billing, carriers, storage, protection, notifications, cms, assistant, reports, reference];
