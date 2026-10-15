"use client";

/** Step bodies for the quote wizard. Each receives the draft, an updater and the step's errors. */
import Link from "next/link";
import { useRef, useState } from "react";
import { Loader2, Paperclip, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { otherFloridaRoute } from "@/content/site";
import type { ServiceType } from "@/lib/quote-schema";
import {
  emptyItem,
  emptyLocation,
  locationWithFacility,
  LOCAL_SPEEDS,
  SHIPPING_SPEEDS,
  totalPieces,
  type DraftItem,
  type DraftLocation,
  type FieldErrors,
  type QuoteDraft,
  type StepDef,
} from "./flow";
import { CheckField, ChoicePills, Group, SelectField, TextArea, TextField } from "./fields";
import {
  AIRPORT_CHOICES,
  BILLING_LABELS,
  ITEM_CATEGORY_LABELS,
  LEAD_SOURCE_LABELS,
  LOCATION_TYPE_LABELS,
  LOCATION_TYPES_FOR,
  MARKET_CHOICES,
  MARKET_CHOICES_SHIPPING,
  marketLabel,
  PORT_CHOICES,
  PREFERRED_CONTACT_LABELS,
  SERVICE_CARDS,
  SPEED_LABELS,
  TIME_WINDOW_LABELS,
  VEHICLE_CHOICES,
} from "./options";

export type Update = (fn: (d: QuoteDraft) => QuoteDraft) => void;
type StepProps = { draft: QuoteDraft; update: Update; errors: FieldErrors };

const opts = <T extends string>(rec: Record<T, string>) => (Object.keys(rec) as T[]).map((value) => ({ value, label: rec[value] }));

/* ------------------------------------------------------------------ */
/* Step 1: service                                                      */
/* ------------------------------------------------------------------ */

export function ServiceStep({ selected, onPick, error }: { selected: ServiceType | ""; onPick: (s: ServiceType) => void; error?: string }) {
  return (
    <fieldset>
      <legend className="sr-only">Choose a service</legend>
      <div id="q-serviceType" tabIndex={-1} className="grid gap-3 outline-none sm:grid-cols-2">
        {SERVICE_CARDS.map(({ type, title, text, Icon, note }) => {
          const active = selected === type;
          return (
            <label
              key={type}
              className={`group relative flex cursor-pointer gap-4 rounded-2xl border p-4 transition has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-orange/40 sm:p-5 ${
                active ? "border-navy bg-navy text-white shadow-[var(--shadow-lift)]" : "border-line bg-white hover:-translate-y-0.5 hover:border-navy/30 hover:shadow-[var(--shadow-card)]"
              }`}
            >
              <input type="radio" name="serviceType" value={type} checked={active} onChange={() => onPick(type)} className="sr-only" />
              <span
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${active ? "bg-orange text-white" : "bg-orange-50 text-orange-700"}`}
                aria-hidden
              >
                <Icon className="h-6 w-6" strokeWidth={1.8} />
              </span>
              <span className="min-w-0">
                <span className={`block font-display text-base font-bold ${active ? "text-white" : "text-navy"}`}>{title}</span>
                <span className={`mt-1 block text-sm leading-snug ${active ? "text-white/80" : "text-slate-ink"}`}>{text}</span>
                {note && (
                  <span className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${active ? "bg-white/15 text-white" : "bg-navy-50 text-navy"}`}>{note}</span>
                )}
              </span>
            </label>
          );
        })}
      </div>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
    </fieldset>
  );
}

/* ------------------------------------------------------------------ */
/* Locations                                                            */
/* ------------------------------------------------------------------ */

function LocationBlock({
  prefix,
  title,
  loc,
  onChange,
  errors,
  service,
  onRemove,
}: {
  prefix: string;
  title: string;
  loc: DraftLocation;
  onChange: (l: DraftLocation) => void;
  errors: FieldErrors;
  service: ServiceType | "";
  onRemove?: () => void;
}) {
  const marketChoices = service === "nationwide-shipping" ? MARKET_CHOICES_SHIPPING : MARKET_CHOICES;
  const e = (k: string) => errors[`${prefix}.${k}`];
  const addressLabel =
    loc.type === "airport" ? "Terminal, airline or meeting point" : loc.type === "cruise-port" ? "Terminal or meeting point" : "Address, ZIP code or place name";
  return (
    <Group title={title}>
      {onRemove && (
        <button type="button" onClick={onRemove} className="-mt-12 ml-auto inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50">
          <Trash2 className="h-4 w-4" aria-hidden /> Remove stop
        </button>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          path={`${prefix}.type`}
          label="Location type"
          value={loc.type}
          onChange={(type) => onChange({ ...loc, type, facility: type === loc.type ? loc.facility : "" })}
          options={LOCATION_TYPES_FOR(service).map((v) => ({ value: v, label: LOCATION_TYPE_LABELS[v] }))}
          error={e("type")}
        />
        {loc.type === "airport" ? (
          <SelectField path={`${prefix}.facility`} label="Airport" value={loc.facility} onChange={(f) => onChange(locationWithFacility(loc, f))} options={AIRPORT_CHOICES} error={e("facility")} />
        ) : loc.type === "cruise-port" ? (
          <SelectField path={`${prefix}.facility`} label="Cruise port" value={loc.facility} onChange={(f) => onChange(locationWithFacility(loc, f))} options={PORT_CHOICES} error={e("facility")} />
        ) : (
          <SelectField
            path={`${prefix}.market`}
            label="Area"
            value={loc.market}
            onChange={(market) => onChange({ ...loc, market })}
            options={marketChoices}
            error={e("market")}
            hint={loc.market === "other-florida" ? otherFloridaRoute.note : undefined}
          />
        )}
      </div>
      <TextField
        path={`${prefix}.address`}
        label={addressLabel}
        value={loc.address}
        onChange={(address) => onChange({ ...loc, address })}
        error={e("address")}
        autoComplete={loc.type === "residence" || loc.type === "business" ? "street-address" : "off"}
        placeholder={loc.type === "hotel" ? "Hotel name and city" : loc.type === "airport" ? "e.g. Terminal D baggage claim, flight arrival" : "Street address or ZIP code"}
      />
      {(loc.type === "airport" || loc.type === "cruise-port") && (
        <SelectField path={`${prefix}.market`} label="Area" value={loc.market} onChange={(market) => onChange({ ...loc, market })} options={marketChoices} error={e("market")} hint="Filled in for you from the airport or port" />
      )}
      <TextField path={`${prefix}.notes`} label="Notes for this location" value={loc.notes} onChange={(notes) => onChange({ ...loc, notes })} optional placeholder="Gate code, loading dock, contact on site…" />
    </Group>
  );
}

export function RouteStep({ draft, update, errors }: StepProps) {
  const s = draft.serviceType;
  const allowStops = s === "courier" || s === "truck" || s === "luggage-local";
  return (
    <div className="grid gap-5">
      <LocationBlock prefix="pickup" title={s === "nationwide-shipping" ? "Origin (Express Bags pickup)" : "Pickup"} loc={draft.pickup} onChange={(pickup) => update((d) => ({ ...d, pickup }))} errors={errors} service={s} />
      {draft.extraStops.map((stop, i) => (
        <LocationBlock
          key={i}
          prefix={`extraStops.${i}`}
          title={`Stop ${i + 1}`}
          loc={stop}
          service={s}
          errors={errors}
          onChange={(l) => update((d) => ({ ...d, extraStops: d.extraStops.map((x, j) => (j === i ? l : x)) }))}
          onRemove={() => update((d) => ({ ...d, extraStops: d.extraStops.filter((_, j) => j !== i) }))}
        />
      ))}
      {allowStops && draft.extraStops.length < 20 && (
        <button
          type="button"
          onClick={() => update((d) => ({ ...d, extraStops: [...d.extraStops, emptyLocation(s === "luggage-local" ? "hotel" : "business", d.pickup.market)] }))}
          className="btn-ghost w-full sm:w-auto"
        >
          <Plus className="h-4 w-4" aria-hidden /> Add a stop between pickup and delivery
        </button>
      )}
      <LocationBlock prefix="delivery" title={s === "nationwide-shipping" ? "Destination" : "Delivery"} loc={draft.delivery} onChange={(delivery) => update((d) => ({ ...d, delivery }))} errors={errors} service={s} />
      {s === "nationwide-shipping" && (
        <p className="rounded-xl bg-navy-50 p-4 text-sm text-navy">
          Express Bags picks up your luggage first, then hands it to a trusted national carrier for delivery. We confirm the best option and the price in your written quotation.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Storage                                                              */
/* ------------------------------------------------------------------ */

export function StorageStep({ draft, update, errors }: StepProps) {
  return (
    <div className="grid gap-5">
      <Group title="Storage window" text="Short-term holding when check-in, flight or cruise times don't line up. Availability, duration and item restrictions are confirmed in your quote.">
        <SelectField path="storageMarket" label="Storage area" value={draft.storageMarket} onChange={(storageMarket) => update((d) => ({ ...d, storageMarket }))} options={MARKET_CHOICES} error={errors.storageMarket} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField path="storageStart" type="datetime-local" label="Drop-off (or pickup) date and time" value={draft.storageStart} onChange={(storageStart) => update((d) => ({ ...d, storageStart }))} error={errors.storageStart ?? errors.serviceDate} />
          <TextField path="storageEnd" type="datetime-local" label="Retrieval (or delivery) date and time" value={draft.storageEnd} onChange={(storageEnd) => update((d) => ({ ...d, storageEnd }))} error={errors.storageEnd} />
        </div>
      </Group>
      <div className="grid gap-3 sm:grid-cols-2">
        <CheckField path="storageWithPickup" label={<><strong>Add pickup</strong><span className="block text-muted">We collect the bags and bring them to storage.</span></>} checked={draft.storageWithPickup}
          onChange={(v) => update((d) => ({ ...d, storageWithPickup: v, pickup: v && d.pickup.type === "" ? emptyLocation("hotel", d.storageMarket) : d.pickup }))} />
        <CheckField path="storageWithDelivery" label={<><strong>Add delivery</strong><span className="block text-muted">We deliver the bags from storage later.</span></>} checked={draft.storageWithDelivery}
          onChange={(v) => update((d) => ({ ...d, storageWithDelivery: v, delivery: v && d.delivery.type === "" ? emptyLocation("airport", d.storageMarket) : d.delivery }))} />
      </div>
      {draft.storageWithPickup && <LocationBlock prefix="pickup" title="Pickup before storage" loc={draft.pickup} onChange={(pickup) => update((d) => ({ ...d, pickup }))} errors={errors} service="storage" />}
      {draft.storageWithDelivery && <LocationBlock prefix="delivery" title="Delivery after storage" loc={draft.delivery} onChange={(delivery) => update((d) => ({ ...d, delivery }))} errors={errors} service="storage" />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Group / event                                                        */
/* ------------------------------------------------------------------ */

export function GroupStep({ draft, update, errors }: StepProps) {
  return (
    <div className="grid gap-5">
      <p className="rounded-xl border border-orange/30 bg-orange-50 p-4 text-sm text-charcoal">
        <strong className="text-navy">Custom quotation.</strong> Group, VIP and event programs are planned and priced individually by our team, based on vehicles, labor, timing, staging and coordination.
      </p>
      <Group title="The program">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField path="groupName" label="Group or organization name" value={draft.groupName} onChange={(groupName) => update((d) => ({ ...d, groupName }))} error={errors.groupName} placeholder="e.g. Corporate incentive group" />
          <TextField path="eventName" label="Event, tour or program" optional value={draft.eventName} onChange={(eventName) => update((d) => ({ ...d, eventName }))} placeholder="e.g. Convention, team trip, cruise program" />
          <TextField path="serviceDate" type="date" label="First service date" value={draft.serviceDate} onChange={(serviceDate) => update((d) => ({ ...d, serviceDate }))} error={errors.serviceDate} />
          <TextField path="deadline" type="date" label="Last service date" optional value={draft.deadline} onChange={(deadline) => update((d) => ({ ...d, deadline }))} />
          <TextField path="travelers" label="Estimated passengers" optional inputMode="numeric" value={draft.travelers} onChange={(travelers) => update((d) => ({ ...d, travelers }))} error={errors.travelers} />
          <TextField path="hotelsOrVenues" label="Number of hotels or venues" optional inputMode="numeric" value={draft.hotelsOrVenues} onChange={(hotelsOrVenues) => update((d) => ({ ...d, hotelsOrVenues }))} error={errors.hotelsOrVenues} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <CheckField path="groupInvolvesAirport" label="Involves an airport" checked={draft.groupInvolvesAirport} onChange={(v) => update((d) => ({ ...d, groupInvolvesAirport: v }))} />
          <CheckField path="groupInvolvesCruise" label="Involves a cruise" checked={draft.groupInvolvesCruise} onChange={(v) => update((d) => ({ ...d, groupInvolvesCruise: v }))} />
          <CheckField path="onsiteCoordination" label="On-site coordination needed" checked={draft.onsiteCoordination} onChange={(v) => update((d) => ({ ...d, onsiteCoordination: v }))} />
        </div>
        <TextField path="vehiclesNeeded" label="Vehicle needs, if known" optional value={draft.vehiclesNeeded} onChange={(vehiclesNeeded) => update((d) => ({ ...d, vehiclesNeeded }))} placeholder="e.g. two 26-foot trucks, not sure" />
      </Group>
      <LocationBlock prefix="pickup" title="Main pickup location" loc={draft.pickup} onChange={(pickup) => update((d) => ({ ...d, pickup }))} errors={errors} service="group-event" />
      {draft.extraStops.map((stop, i) => (
        <LocationBlock
          key={i}
          prefix={`extraStops.${i}`}
          title={`Additional location ${i + 1}`}
          loc={stop}
          service="group-event"
          errors={errors}
          onChange={(l) => update((d) => ({ ...d, extraStops: d.extraStops.map((x, j) => (j === i ? l : x)) }))}
          onRemove={() => update((d) => ({ ...d, extraStops: d.extraStops.filter((_, j) => j !== i) }))}
        />
      ))}
      {draft.extraStops.length < 20 && (
        <button type="button" onClick={() => update((d) => ({ ...d, extraStops: [...d.extraStops, emptyLocation("hotel", d.pickup.market)] }))} className="btn-ghost w-full sm:w-auto">
          <Plus className="h-4 w-4" aria-hidden /> Add another pickup or delivery location
        </button>
      )}
      <LocationBlock prefix="delivery" title="Main delivery location" loc={draft.delivery} onChange={(delivery) => update((d) => ({ ...d, delivery }))} errors={errors} service="group-event" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Timing                                                               */
/* ------------------------------------------------------------------ */

export function TimingStep({ draft, update, errors, step }: StepProps & { step: StepDef }) {
  const s = draft.serviceType;
  const showDate = s !== "storage" && s !== "group-event";
  const speeds = s === "nationwide-shipping" ? SHIPPING_SPEEDS : s === "group-event" ? [] : LOCAL_SPEEDS;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="grid gap-5">
      {showDate && (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField path="serviceDate" type="date" min={today} label={s === "nationwide-shipping" ? "Pickup date" : "Service date"} value={draft.serviceDate} onChange={(serviceDate) => update((d) => ({ ...d, serviceDate }))} error={errors.serviceDate} />
          <TextField path="deadline" label={s === "nationwide-shipping" ? "Needed at destination by" : "Must be completed by"} optional value={draft.deadline} onChange={(deadline) => update((d) => ({ ...d, deadline }))} placeholder="e.g. before 3 PM, check-in time, sailing time" />
        </div>
      )}
      <ChoicePills
        path="timeWindow"
        legend={s === "storage" ? "Preferred drop-off window" : s === "group-event" ? "Typical service window" : "Preferred pickup window"}
        value={draft.timeWindow}
        onChange={(timeWindow) => update((d) => ({ ...d, timeWindow }))}
        options={opts(TIME_WINDOW_LABELS)}
        error={errors.timeWindow}
      />
      {speeds.length > 0 && (
        <ChoicePills
          path="speed"
          legend={s === "nationwide-shipping" ? "Delivery speed" : "How soon?"}
          hint={s === "nationwide-shipping" ? "Transit times are approximate and confirmed in your quote." : "Same-day and urgent service may be available, subject to capacity and dispatch confirmation."}
          value={draft.speed}
          onChange={(speed) => update((d) => ({ ...d, speed }))}
          options={speeds.map((v) => ({ value: v, label: SPEED_LABELS[v].label, hint: SPEED_LABELS[v].hint }))}
          error={errors.speed}
        />
      )}
      {s === "cruise" && (
        <TextField path="sailingDate" type="date" label="Sailing date" optional value={draft.sailingDate} onChange={(sailingDate) => update((d) => ({ ...d, sailingDate }))} />
      )}
      {step.id === "timing" && s === "group-event" && <p className="text-sm text-muted">Exact timings for each movement are planned with you in the quotation.</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Items                                                                */
/* ------------------------------------------------------------------ */

const LUGGAGE_CATS: DraftItem["category"][] = ["carry-on", "standard-checked", "large", "oversized", "special"];

function ItemRow({ item, index, onChange, onRemove, errors, cargo, requireDims }: {
  item: DraftItem; index: number; onChange: (i: DraftItem) => void; onRemove?: () => void; errors: FieldErrors; cargo: boolean; requireDims: boolean;
}) {
  const p = `items.${index}`;
  const showDims = requireDims || cargo || item.category === "oversized" || item.category === "special";
  return (
    <div className="rounded-2xl border border-line bg-white p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-navy">{cargo ? `Item ${index + 1}` : `Bag type ${index + 1}`}</p>
        {onRemove && (
          <button type="button" onClick={onRemove} className="inline-flex h-10 items-center gap-1 rounded-full px-3 text-sm text-red-700 hover:bg-red-50" aria-label={`Remove item ${index + 1}`}>
            <Trash2 className="h-4 w-4" aria-hidden /> Remove
          </button>
        )}
      </div>
      <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_8rem]">
        {cargo ? (
          <TextField path={`${p}.description`} label="What is it?" value={item.description} onChange={(description) => onChange({ ...item, description })} placeholder="e.g. 4 pallets of event materials, documents, equipment cases" error={errors[`${p}.description`]} />
        ) : (
          <SelectField path={`${p}.category`} label="Bag type" value={item.category} onChange={(category) => onChange({ ...item, category })} options={LUGGAGE_CATS.map((c) => ({ value: c, label: ITEM_CATEGORY_LABELS[c] }))} error={errors[`${p}.category`]} />
        )}
        <QuantityField path={`${p}.quantity`} value={item.quantity} onChange={(quantity) => onChange({ ...item, quantity })} error={errors[`${p}.quantity`]} />
      </div>
      {!cargo && item.category === "special" && (
        <TextField className="mt-4" path={`${p}.description`} label="Describe the item" value={item.description} onChange={(description) => onChange({ ...item, description })} placeholder="e.g. golf bag, guitar case, stroller" />
      )}
      {showDims && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <TextField path={`${p}.weightLbs`} label="Weight (lbs)" inputMode="decimal" optional={!requireDims} value={item.weightLbs} onChange={(weightLbs) => onChange({ ...item, weightLbs })} error={errors[`${p}.weightLbs`]} />
          <TextField path={`${p}.lengthIn`} label="Length (in)" inputMode="decimal" optional={!requireDims} value={item.lengthIn} onChange={(lengthIn) => onChange({ ...item, lengthIn })} error={errors[`${p}.lengthIn`]} />
          <TextField path={`${p}.widthIn`} label="Width (in)" inputMode="decimal" optional={!requireDims} value={item.widthIn} onChange={(widthIn) => onChange({ ...item, widthIn })} error={errors[`${p}.widthIn`]} />
          <TextField path={`${p}.heightIn`} label="Height (in)" inputMode="decimal" optional={!requireDims} value={item.heightIn} onChange={(heightIn) => onChange({ ...item, heightIn })} error={errors[`${p}.heightIn`]} />
        </div>
      )}
      {requireDims && <p className="mt-2 text-xs text-muted">Carriers can charge by size as well as weight, so accurate dimensions keep your quote accurate.</p>}
    </div>
  );
}

function QuantityField({ path, value, onChange, error }: { path: string; value: string; onChange: (v: string) => void; error?: string }) {
  const n = Number(value) || 0;
  return (
    <div>
      <label htmlFor={`q-${path.replace(/\./g, "-")}`} className="mb-1.5 block text-sm font-semibold text-navy">Quantity</label>
      <div className={`flex items-center rounded-xl border bg-white ${error ? "border-red-500" : "border-line"}`}>
        <button type="button" onClick={() => onChange(String(Math.max(1, n - 1)))} className="h-12 w-11 shrink-0 text-xl font-semibold text-navy" aria-label="Decrease quantity">−</button>
        <input
          id={`q-${path.replace(/\./g, "-")}`}
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
          aria-invalid={error ? true : undefined}
          className="h-12 w-full min-w-0 border-x border-line text-center text-base font-semibold text-charcoal focus:outline-none"
        />
        <button type="button" onClick={() => onChange(String(n + 1))} className="h-12 w-11 shrink-0 text-xl font-semibold text-navy" aria-label="Increase quantity">+</button>
      </div>
      {error && <p className="mt-1.5 text-sm text-red-700">{error}</p>}
    </div>
  );
}

export function ItemsStep({ draft, update, errors }: StepProps) {
  const s = draft.serviceType;
  const cargo = s === "courier" || s === "truck";
  const requireDims = s === "nationwide-shipping";
  const setItem = (i: number, it: DraftItem) => update((d) => ({ ...d, items: d.items.map((x, j) => (j === i ? it : x)) }));
  return (
    <div className="grid gap-5">
      {errors.items && <p className="text-sm text-red-700">{errors.items}</p>}
      <div className="grid gap-3">
        {draft.items.map((it, i) => (
          <ItemRow key={i} item={it} index={i} cargo={cargo} requireDims={requireDims} errors={errors}
            onChange={(x) => setItem(i, x)}
            onRemove={draft.items.length > 1 ? () => update((d) => ({ ...d, items: d.items.filter((_, j) => j !== i) })) : undefined} />
        ))}
        <button type="button" onClick={() => update((d) => ({ ...d, items: [...d.items, emptyItem(cargo ? "cargo" : "large", "1")] }))} className="btn-ghost w-full sm:w-auto">
          <Plus className="h-4 w-4" aria-hidden /> {cargo ? "Add another item" : "Add another bag type"}
        </button>
        {!cargo && <p className="text-sm text-muted">Total pieces: <strong className="text-navy">{totalPieces(draft)}</strong></p>}
      </div>

      {(s === "luggage-local" || s === "airport" || s === "cruise" || s === "storage" || s === "nationwide-shipping") && (
        <TextField path="travelers" label="Number of travelers" optional inputMode="numeric" value={draft.travelers} onChange={(travelers) => update((d) => ({ ...d, travelers }))} error={errors.travelers} />
      )}

      {s === "airport" && (
        <TextField path="flightDetails" label="Flight details" optional value={draft.flightDetails} onChange={(flightDetails) => update((d) => ({ ...d, flightDetails }))} placeholder="Airline, flight number and arrival or departure time" />
      )}
      {s === "cruise" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField path="cruiseLine" label="Cruise line" optional value={draft.cruiseLine} onChange={(cruiseLine) => update((d) => ({ ...d, cruiseLine }))} />
          <TextField path="shipName" label="Ship" optional value={draft.shipName} onChange={(shipName) => update((d) => ({ ...d, shipName }))} />
        </div>
      )}
      {s === "truck" && (
        <Group title="Vehicle and labor">
          <SelectField path="vehiclesNeeded" label="Vehicle size preference" value={draft.vehiclesNeeded} onChange={(vehiclesNeeded) => update((d) => ({ ...d, vehiclesNeeded }))} options={VEHICLE_CHOICES.map((v) => ({ value: v, label: v }))} optional />
          <TextField path="laborNeeded" label="Loading help needed" optional value={draft.laborNeeded} onChange={(laborNeeded) => update((d) => ({ ...d, laborNeeded }))} placeholder="e.g. driver plus one helper" />
        </Group>
      )}
      {(s === "courier" || s === "truck") && (
        <CheckField path="recurringRoute" label={<><strong>This is a recurring route</strong><span className="block text-muted">Daily, weekly or scheduled deliveries we should plan as an account.</span></>} checked={draft.recurringRoute} onChange={(v) => update((d) => ({ ...d, recurringRoute: v }))} />
      )}
      {s === "group-event" && (
        <TextArea path="laborNeeded" label="Staging, loading or helper requirements" optional value={draft.laborNeeded} onChange={(laborNeeded) => update((d) => ({ ...d, laborNeeded }))} placeholder="e.g. bag tagging by room, staging in the lobby, load-in at the venue" />
      )}

      <TextArea
        path="accessNotes"
        label="Access details"
        optional
        value={draft.accessNotes}
        onChange={(accessNotes) => update((d) => ({ ...d, accessNotes }))}
        placeholder={cargo ? "Loading dock, stairs, elevator, parking, delivery hours" : "Stairs, parking, bell desk, terminal or gate instructions"}
      />
      <TextArea path="specialHandling" label="Special handling" optional value={draft.specialHandling} onChange={(specialHandling) => update((d) => ({ ...d, specialHandling }))} placeholder="Fragile, high-value, oversized or temperature-sensitive items" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Contact (+ uploads)                                                  */
/* ------------------------------------------------------------------ */

const MAX_FILES = 10;
const MAX_BYTES = 10 * 1024 * 1024;

export function ContactStep({ draft, update, errors, apiUrl }: StepProps & { apiUrl: string }) {
  const [uploading, setUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setUploadNote("");
    const added: { id: string; name: string }[] = [];
    let skipped = 0;
    for (const file of Array.from(files).slice(0, MAX_FILES - draft.attachments.length)) {
      if (file.size > MAX_BYTES) { skipped++; continue; }
      try {
        const body = new FormData();
        body.append("file", file);
        const res = await fetch(`${apiUrl}/v1/uploads`, { method: "POST", body });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as { id?: string };
        if (!json.id) throw new Error("no id");
        added.push({ id: json.id, name: file.name });
      } catch {
        skipped++;
      }
    }
    if (added.length) update((d) => ({ ...d, attachments: [...d.attachments, ...added].slice(0, MAX_FILES) }));
    if (skipped) setUploadNote(`${skipped} file${skipped > 1 ? "s" : ""} could not be attached. You can still send your request and share files with our team afterwards.`);
    setUploading(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  const c = draft.contact;
  const setC = (patch: Partial<QuoteDraft["contact"]>) => update((d) => ({ ...d, contact: { ...d.contact, ...patch } }));
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField path="contact.name" label="Full name" autoComplete="name" value={c.name} onChange={(name) => setC({ name })} error={errors["contact.name"]} />
        <TextField path="contact.company" label="Company or hotel" optional autoComplete="organization" value={c.company} onChange={(company) => setC({ company })} />
        <TextField path="contact.email" type="email" inputMode="email" label="Email" autoComplete="email" value={c.email} onChange={(email) => setC({ email })} error={errors["contact.email"]} />
        <TextField path="contact.phone" type="tel" inputMode="tel" label="Phone" autoComplete="tel" value={c.phone} onChange={(phone) => setC({ phone })} error={errors["contact.phone"]} />
      </div>
      <ChoicePills path="contact.preferredContact" legend="Best way to reach you" value={c.preferredContact} onChange={(preferredContact) => setC({ preferredContact })} options={opts(PREFERRED_CONTACT_LABELS)} />
      <TextField path="onsiteContact" label="On-site contact, if different" optional value={draft.onsiteContact} onChange={(onsiteContact) => update((d) => ({ ...d, onsiteContact }))} placeholder="Name and phone of the person handing over or receiving" />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField path="billingType" label="Who is this for?" value={draft.billingType} onChange={(billingType) => update((d) => ({ ...d, billingType }))} options={opts(BILLING_LABELS)} />
        <SelectField path="leadSource" label="How did you hear about us?" value={draft.leadSource} onChange={(leadSource) => update((d) => ({ ...d, leadSource }))} options={opts(LEAD_SOURCE_LABELS)} error={errors.leadSource} />
      </div>
      <TextArea path="notes" label="Anything else we should know?" optional rows={4} value={draft.notes} onChange={(notes) => update((d) => ({ ...d, notes }))} />

      <div>
        <p className="mb-1.5 text-sm font-semibold text-navy">Attachments <span className="font-normal text-muted">(optional)</span></p>
        <p className="mb-2 text-xs text-muted">Manifests, rooming lists, itineraries or photos. Up to {MAX_FILES} files, 10 MB each.</p>
        <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-navy/20 bg-white px-4 py-5 text-sm font-semibold text-navy hover:border-navy/40 ${uploading ? "pointer-events-none opacity-60" : ""}`}>
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Upload className="h-5 w-5" aria-hidden />}
          {uploading ? "Attaching…" : "Choose files"}
          <input ref={fileInput} type="file" multiple className="sr-only" onChange={(e) => onFiles(e.target.files)} accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.heic,.webp" />
        </label>
        {uploadNote && <p role="status" className="mt-2 text-sm text-slate-ink">{uploadNote}</p>}
        {draft.attachments.length > 0 && (
          <ul className="mt-3 grid gap-2">
            {draft.attachments.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 rounded-xl bg-cloud px-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2"><Paperclip className="h-4 w-4 shrink-0 text-muted" aria-hidden /><span className="truncate">{a.name}</span></span>
                <button type="button" onClick={() => update((d) => ({ ...d, attachments: d.attachments.filter((x) => x.id !== a.id) }))} className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-white" aria-label={`Remove ${a.name}`}>
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Review                                                               */
/* ------------------------------------------------------------------ */

function describeLocation(l: DraftLocation) {
  if (!l.type) return "Not set";
  const where = [l.address, l.market ? marketLabel(l.market) : ""].filter(Boolean).join(", ");
  return `${LOCATION_TYPE_LABELS[l.type]}${where ? ` · ${where}` : ""}`;
}

export function ReviewStep({ draft, update, errors, steps, goTo }: StepProps & { steps: StepDef[]; goTo: (id: StepDef["id"]) => void }) {
  const s = draft.serviceType;
  const card = SERVICE_CARDS.find((c) => c.type === s);
  const has = (id: StepDef["id"]) => steps.some((x) => x.id === id);
  const rows: { section: StepDef["id"]; label: string; value: string }[] = [
    { section: "service", label: "Service", value: card?.title ?? "" },
  ];
  if (s === "storage") {
    rows.push({ section: "storage", label: "Storage", value: `${marketLabel(draft.storageMarket)} · ${draft.storageStart.replace("T", " ")} to ${draft.storageEnd.replace("T", " ")}` });
    if (draft.storageWithPickup) rows.push({ section: "storage", label: "Pickup", value: describeLocation(draft.pickup) });
    if (draft.storageWithDelivery) rows.push({ section: "storage", label: "Delivery", value: describeLocation(draft.delivery) });
  } else {
    const sec: StepDef["id"] = has("group") ? "group" : "route";
    if (s === "group-event") rows.push({ section: "group", label: "Program", value: [draft.groupName, draft.eventName, draft.serviceDate && `from ${draft.serviceDate}`, draft.deadline && `to ${draft.deadline}`].filter(Boolean).join(" · ") });
    rows.push({ section: sec, label: s === "nationwide-shipping" ? "Origin" : "Pickup", value: describeLocation(draft.pickup) });
    draft.extraStops.forEach((x, i) => rows.push({ section: sec, label: `Stop ${i + 1}`, value: describeLocation(x) }));
    rows.push({ section: sec, label: s === "nationwide-shipping" ? "Destination" : "Delivery", value: describeLocation(draft.delivery) });
  }
  rows.push({
    section: "timing",
    label: "Timing",
    value: [s !== "storage" && s !== "group-event" ? draft.serviceDate : "", draft.timeWindow ? TIME_WINDOW_LABELS[draft.timeWindow] : "", s !== "group-event" ? SPEED_LABELS[draft.speed].label : "", draft.deadline && s !== "group-event" ? `by ${draft.deadline}` : ""].filter(Boolean).join(" · "),
  });
  rows.push({
    section: "items",
    label: "Items",
    value: draft.items.map((i) => `${i.quantity || 0} × ${i.category === "cargo" ? i.description || "item" : ITEM_CATEGORY_LABELS[i.category]}`).join(", "),
  });
  rows.push({ section: "contact", label: "Contact", value: [draft.contact.name, draft.contact.email, draft.contact.phone].filter(Boolean).join(" · ") });
  if (draft.attachments.length) rows.push({ section: "contact", label: "Attachments", value: `${draft.attachments.length} file(s)` });

  return (
    <div className="grid gap-5">
      <dl className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
        {rows.map((r, i) => (
          <div key={i} className="flex items-start justify-between gap-3 px-4 py-3.5 sm:px-5">
            <div className="min-w-0">
              <dt className="text-xs font-semibold uppercase tracking-wider text-muted">{r.label}</dt>
              <dd className="mt-0.5 break-words text-sm text-charcoal">{r.value || "Not provided"}</dd>
            </div>
            {has(r.section) && (
              <button type="button" onClick={() => goTo(r.section)} className="inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-50" aria-label={`Edit ${r.label}`}>
                <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
              </button>
            )}
          </div>
        ))}
      </dl>

      <div className="grid gap-3">
        <CheckField
          path="acceptsProhibitedItemsPolicy"
          checked={draft.acceptsProhibitedItemsPolicy}
          onChange={(v) => update((d) => ({ ...d, acceptsProhibitedItemsPolicy: v }))}
          error={errors.acceptsProhibitedItemsPolicy}
          label={
            <>
              I confirm my items do not include illegal, hazardous or prohibited goods, and I have read the{" "}
              <Link href="/terms#prohibited-items" className="font-semibold text-orange-700 underline" target="_blank">prohibited-items policy</Link>.
            </>
          }
        />
        <CheckField
          path="consentToContact"
          checked={draft.consentToContact}
          onChange={(v) => update((d) => ({ ...d, consentToContact: v }))}
          error={errors.consentToContact}
          label={<>I agree that Express Bags may contact me about this request. See our <Link href="/privacy-policy" className="font-semibold text-orange-700 underline" target="_blank">privacy policy</Link>.</>}
        />
      </div>

      {/* Honeypot: hidden from people and assistive tech, bots fill it */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="q-website">Website</label>
        <input id="q-website" name="website" tabIndex={-1} autoComplete="off" value={draft.website} onChange={(e) => update((d) => ({ ...d, website: e.target.value }))} />
      </div>
    </div>
  );
}
