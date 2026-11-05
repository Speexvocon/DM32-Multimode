// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
    RECORD_BYTES, RECORD_COUNT, MEMORY_COUNT, FILTERS,
    crc32, decodePayload, encodePayload, validateModel, createDefaultModel, exportFile, importFile, setChannelMode,
} from "../model.js";

const clone = (value) => JSON.parse(JSON.stringify(value));
const fromHex = (text) => Uint8Array.from(text.match(/../g), (pair) => parseInt(pair, 16));

// Independently packed using Python struct '<IIHHBB12sHHBB' / '<IBHHBBBBB',
// then checked with Python zlib.crc32 and hashlib.sha256. No personal radio data.
function wireFixture() {
    const payload = new Uint8Array(1120);
    payload.set(fromHex("a034af08e00ca60893020a0015094c6f63616c00000000000000000000000500"), 0);
    payload.set(fromHex("806b951aa00c9d1aff0fffff2b0f4142434445464748494a4b4c754313c00900"), 31 * 32);
    payload.set(fromHex("a034af08a034af0800000100030056464f204100000000000000ff81284a0000"), 32 * 32);
    payload.set(fromHex("010000002a580200000101200301000000000000000000000000000000000000"), 34 * 32);
    return payload;
}

test("geometry and CRC match the firmware and independent standard vectors", () => {
    assert.equal(RECORD_BYTES, 32);
    assert.equal(RECORD_COUNT, 35);
    assert.equal(MEMORY_COUNT, 32);
    assert.deepEqual(FILTERS, ["NAC", "PROM", "NAC+TG"]);
    assert.equal(crc32(new Uint8Array()), 0);
    assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
    assert.equal(crc32(wireFixture()), 0xbf2c0b25);
    assert.equal(createHash("sha256").update(wireFixture()).digest("hex"), "f7c6fa6a54ab47f2a961cd3847a028050f35e9dd146bb2b2ca6d18fdc476fb93");
});

test("independent wire fixture decodes P25, wide FM, NFM, scan membership and empty VFO", () => {
    const fixture = wireFixture();
    const before = fixture.slice();
    const model = decodePayload(fixture);
    assert.deepEqual(model.channels[0], {
        name: "Local", rxHz: 145700000, txHz: 145100000, mode: "P25", nac: 0x293, talkgroup: 10,
        filter: "PROM", rxOnly: true, scanLists: [0, 3], squelch: 5,
        txTone: { type: "none", value: 0 }, rxTone: { type: "none", value: 0 },
    });
    assert.equal(model.channels[31].name, "ABCDEFGHIJKL");
    assert.equal(model.channels[31].mode, "FM");
    assert.equal(model.channels[31].nac, 0xfff);
    assert.equal(model.channels[31].talkgroup, 65535);
    assert.deepEqual(model.channels[31].scanLists, [0, 1, 2, 3]);
    assert.deepEqual(model.channels[31].txTone, { type: "ctcss", value: 885 });
    assert.deepEqual(model.channels[31].rxTone, { type: "dcs-inv", value: 19 });
    assert.equal(model.vfos[0].mode, "NFM");
    assert.deepEqual(model.vfos[0].txTone, { type: "dcs", value: 511 });
    assert.deepEqual(model.vfos[0].rxTone, { type: "ctcss", value: 2600 });
    assert.equal(model.vfos[1], null);
    assert.deepEqual(model.settings, { sourceId: 1, micGainDb: 42, screenSeconds: 600, keypadSeconds: 0,
        activeVfo: 1, selectionA: 1, selectionB: 32, scanList: 3, txInhibit: true });
    assert.deepEqual(model.channels.slice(1, 31), Array(30).fill(null));
    assert.deepEqual(encodePayload(model), fixture);
    assert.deepEqual(fixture, before);
});

test("decoder honors nonzero typed-array offsets and does not retain mutable byte aliases", () => {
    const backing = new Uint8Array(1133).fill(0xfe);
    backing.set(wireFixture(), 7);
    const view = backing.subarray(7, 1127);
    const model = decodePayload(view);
    view.fill(0);
    assert.equal(model.channels[0].name, "Local");
    assert.deepEqual(encodePayload(model), wireFixture());
    assert.equal(backing[0], 0xfe);
});

test("default drafts are independent, valid, complete and transmit-policy neutral until upload", () => {
    const first = createDefaultModel(), second = createDefaultModel();
    assert.deepEqual(validateModel(first), []);
    assert.equal(first.settings.txInhibit, false);
    assert.equal(first.settings.sourceId, 1);
    assert.equal(first.settings.micGainDb, 11);
    assert.equal(first.vfos[0].nac, 0x293);
    assert.equal(first.vfos[0].rxHz, 145700000);
    assert.equal(first.settings.screenSeconds, 60);
    assert.equal(first.settings.keypadSeconds, 15);
    first.vfos[0].txTone.value = 123;
    assert.equal(first.vfos[1].txTone.value, 0);
    assert.equal(second.vfos[0].txTone.value, 0);
    assert.deepEqual(decodePayload(encodePayload(second)), second);
});

test("valid wire boundaries, split bands, names and all tone types round-trip exactly", () => {
    const none = { type: "none", value: 0 };
    const tones = [none, { type: "ctcss", value: 600 }, { type: "ctcss", value: 2600 },
        { type: "dcs", value: 1 }, { type: "dcs", value: 511 }, { type: "dcs-inv", value: 1 }, { type: "dcs-inv", value: 511 }];
    for (const mode of ["P25", "NFM", "FM"]) for (const filter of FILTERS) {
        for (const frequency of [136000000, 174000000, 400000000, 480000000]) for (const tone of mode === "P25" ? [none] : tones) {
            const model = createDefaultModel();
            model.channels[0] = { ...clone(model.vfos[0]), name: " !~012345678", mode, filter,
                rxHz: frequency, txHz: frequency, nac: 0xfff, talkgroup: 65535, rxOnly: true,
                scanLists: [3, 1], txTone: clone(tone), rxTone: clone(tone), squelch: 9 };
            model.settings.selectionA = 1;
            model.settings.sourceId = 0xffffff;
            const payload = encodePayload(model);
            assert.deepEqual(encodePayload(decodePayload(payload)), payload);
            assert.deepEqual(decodePayload(payload).channels[0].scanLists, [1, 3]);
        }
    }
});

test("empty VFOs and an entirely empty channel table remain supported", () => {
    const model = createDefaultModel();
    model.vfos = [null, null];
    assert.deepEqual(validateModel(model), []);
    const payload = encodePayload(model);
    assert(payload.subarray(0, 34 * 32).every((octet) => octet === 0));
    assert.deepEqual(decodePayload(payload), model);
});

test("model validation rejects lossy coercions, reserved properties and invalid references", () => {
    const mutations = [
        ["top-level type", () => null],
        ["missing globals", (model) => { delete model.settings; return model; }],
        ["unknown top-level field", (model) => { model.address = 0x711000; return model; }],
        ["missing memory", (model) => { model.channels.pop(); return model; }],
        ["sparse memory", (model) => { delete model.channels[0]; return model; }],
        ["array extra field", (model) => { model.channels.address = 123; return model; }],
        ["nonprintable name", (model) => { model.vfos[0].name = "wrong\u0000pad"; return model; }],
        ["unicode name", (model) => { model.vfos[0].name = "caf\u00e9"; return model; }],
        ["long name", (model) => { model.vfos[0].name = "1234567890123"; return model; }],
        ["string frequency", (model) => { model.vfos[0].rxHz = "145700000"; return model; }],
        ["fractional frequency", (model) => { model.vfos[0].rxHz = 145700000.5; return model; }],
        ["out-of-band frequency", (model) => { model.vfos[0].rxHz = 200000000; return model; }],
        ["receive-only TX frequency still valid", (model) => { model.vfos[0].rxOnly = true; model.vfos[0].txHz = 0; return model; }],
        ["negative NAC", (model) => { model.vfos[0].nac = -1; return model; }],
        ["NAC overflow", (model) => { model.vfos[0].nac = 0x1000; return model; }],
        ["zero talkgroup", (model) => { model.vfos[0].talkgroup = 0; return model; }],
        ["talkgroup overflow", (model) => { model.vfos[0].talkgroup = 65536; return model; }],
        ["unknown filter", (model) => { model.vfos[0].filter = "ALL"; return model; }],
        ["unknown mode", (model) => { model.vfos[0].mode = "DMR"; return model; }],
        ["non-boolean inhibit", (model) => { model.settings.txInhibit = 1; return model; }],
        ["non-boolean receive-only", (model) => { model.vfos[0].rxOnly = 0; return model; }],
        ["duplicate scan list", (model) => { model.vfos[0].scanLists = [0, 0]; return model; }],
        ["invalid scan list", (model) => { model.vfos[0].scanLists = [4]; return model; }],
        ["sparse scan list", (model) => { model.vfos[0].scanLists = Array(1); return model; }],
        ["sparse scan list with extra", (model) => { model.vfos[0].scanLists = Array(1); model.vfos[0].scanLists.extra = 0; return model; }],
        ["fractional squelch", (model) => { model.vfos[0].squelch = 0.5; return model; }],
        ["unused tone data", (model) => { model.vfos[0].txTone.value = 100; return model; }],
        ["P25 analog tone", (model) => { model.vfos[0].txTone = { type: "ctcss", value: 885 }; return model; }],
        ["bad CTCSS units", (model) => { model.vfos[0].mode = "FM"; model.vfos[0].txTone = { type: "ctcss", value: 88.5 }; return model; }],
        ["DCS zero", (model) => { model.vfos[0].mode = "FM"; model.vfos[0].rxTone = { type: "dcs", value: 0 }; return model; }],
        ["DCS overflow", (model) => { model.vfos[0].mode = "FM"; model.vfos[0].rxTone = { type: "dcs-inv", value: 512 }; return model; }],
        ["empty selected memory", (model) => { model.settings.selectionA = 1; return model; }],
        ["bad pane", (model) => { model.settings.activeVfo = 2; return model; }],
        ["timer overflow", (model) => { model.settings.screenSeconds = 601; return model; }],
        ["source zero", (model) => { model.settings.sourceId = 0; return model; }],
        ["source overflow", (model) => { model.settings.sourceId = 0x1000000; return model; }],
        ["mic gain overflow", (model) => { model.settings.micGainDb = 43; return model; }],
    ];
    for (const [label, mutate] of mutations) {
        const model = mutate(createDefaultModel());
        assert(validateModel(model).length > 0, label);
        assert.throws(() => encodePayload(model), undefined, label);
    }
});

test("wire decoder rejects all reserved bits, noncanonical empties, padding and global fields", () => {
    const mutations = [
        ["unoccupied contains data", (payload) => { payload[32] = 1; }],
        ["both FM and DMR", (payload) => { payload[31 * 32 + 12] |= 0x40; }],
        ["unknown flag 7", (payload) => { payload[12] |= 0x80; }],
        ["filter 3", (payload) => { payload[12] |= 0xc; }],
        ["P25 wide bit", (payload) => { payload[12] |= 0x20; }],
        ["scan mask overflow", (payload) => { payload[13] = 16; }],
        ["embedded nonzero after NUL", (payload) => { payload[20] = 65; }],
        ["nonprintable name", (payload) => { payload[14] = 31; }],
        ["record reserved byte", (payload) => { payload[31] = 1; }],
        ["squelch overflow", (payload) => { payload[30] = 10; }],
        ["unused tone data", (payload) => { payload[26] = 1; }],
        ["P25 tone", (payload) => { payload[26] = 0x75; payload[27] = 0x43; }],
        ["FM invalid CTCSS", (payload) => { payload[31 * 32 + 26] = 0; payload[31 * 32 + 27] = 0x40; }],
        ["FM DCS overflow", (payload) => { payload[31 * 32 + 28] = 0; payload[31 * 32 + 29] = 0xc2; }],
        ["global reserved", (payload) => { payload[34 * 32 + 31] = 1; }],
        ["global inhibit invalid", (payload) => { payload[34 * 32 + 13] = 2; }],
        ["source zero", (payload) => { payload.fill(0, 34 * 32, 34 * 32 + 4); }],
        ["selection empty", (payload) => { payload[34 * 32 + 10] = 2; }],
        ["active VFO invalid", (payload) => { payload[34 * 32 + 9] = 2; }],
        ["timer invalid", (payload) => { payload[34 * 32 + 5] = 0xff; payload[34 * 32 + 6] = 0xff; }],
    ];
    for (const [label, mutate] of mutations) {
        const payload = wireFixture();
        mutate(payload);
        assert.throws(() => decodePayload(payload), undefined, label);
    }
    for (const length of [0, 32, 1119, 1121]) assert.throws(() => decodePayload(new Uint8Array(length)), /Expected 1120/);
    assert.throws(() => decodePayload(Array(1120).fill(0)), /Uint8Array/);
});

test("file export is deterministic, complete, checksummed and keeps download origin separate", () => {
    const model = decodePayload(wireFixture());
    const origin = { revision: 0xffffffff, crc: 0x12345678 };
    const text = exportFile(model, origin);
    const loaded = importFile(text);
    assert.deepEqual(loaded, { model, origin });
    assert.equal(exportFile(loaded.model, loaded.origin), text);
    assert.equal(JSON.parse(text).crc32, "BF2C0B25");
    assert.equal(JSON.parse(text).payload.length, 2240);
    assert.equal(JSON.parse(text).format, "DM32P25-CPS");
    assert.equal(JSON.parse(text).version, 2);
    assert.equal(importFile(exportFile(model)).origin, null);
    loaded.origin.revision = 5;
    assert.equal(origin.revision, 0xffffffff);
    // Editing a draft does not rewrite its original radio snapshot identity.
    model.settings.micGainDb = 22;
    assert.deepEqual(importFile(exportFile(model, origin)).origin, origin);
});

test("file import fails closed for foreign versions, damage, missing fields and malformed origins", () => {
    const original = JSON.parse(exportFile(decodePayload(wireFixture()), { revision: 1, crc: 0xbf2c0b25 }));
    const mutations = [
        (file) => { file.format = "stock DM32"; },
        (file) => { file.version = 3; },
        (file) => { file.version = "1"; },
        (file) => { file.flashAddress = 0x711000; },
        (file) => { delete file.origin; },
        (file) => { file.payload = file.payload.slice(0, -2); },
        (file) => { file.payload = "G" + file.payload.slice(1); },
        (file) => { file.payload = file.payload.slice(0, -1) + "1"; },
        (file) => { file.crc32 = "00000000"; },
        (file) => { file.crc32 = 0xbf2c0b25; },
        (file) => { file.origin = { revision: 0, crc: -1 }; },
        (file) => { file.origin = { revision: 0x100000000, crc: 0 }; },
        (file) => { file.origin = { revision: 0, crc: 0, other: true }; },
        (file) => { file.origin = { revision: 0 }; },
    ];
    for (const mutate of mutations) {
        const file = clone(original);
        mutate(file);
        assert.throws(() => importFile(JSON.stringify(file)));
    }
    assert.throws(() => importFile("not json"), /Invalid CPS JSON/);
    assert.throws(() => importFile("null"), /Unrecognized/);
    assert.throws(() => importFile("[]"), /Unrecognized/);
    assert.throws(() => importFile(exportFile(createDefaultModel()).slice(0, -8)), /Invalid CPS JSON/);
    assert.throws(() => exportFile(createDefaultModel(), { revision: 0, crc: "00000000" }), /Origin/);
    // Recomputing a checksum cannot authorize noncanonical reserved bytes.
    const reserved = wireFixture(); reserved[34 * 32 + 31] = 1;
    const badFile = { ...original, payload: Buffer.from(reserved).toString("hex"), crc32: crc32(reserved).toString(16).padStart(8, "0") };
    assert.throws(() => importFile(JSON.stringify(badFile)), /reserved/);
});

test("V1 files preserve all P25/FM bytes and cannot smuggle DMR records", () => {
    const original = wireFixture();
    const file = JSON.parse(exportFile(decodePayload(original))); file.version = 1;
    assert.deepEqual(encodePayload(importFile(JSON.stringify(file)).model), original);
    assert.deepEqual(decodePayload(original, 1), decodePayload(original, 2));
    file.payload = file.payload.slice(0, 24) + '55' + file.payload.slice(26);
    file.crc32 = crc32(fromHex(file.payload)).toString(16).padStart(8, '0');
    assert.throws(() => importFile(JSON.stringify(file)), /flags/);
});

function dmrChannel(overrides = {}) {
    return { name: 'DMR MAX', rxHz: 145700000, txHz: 145700000, mode: 'DMR', rxOnly: true,
        scanLists: [0, 3], destinationId: 0x123456, colorCode: 15, timeslot: 2,
        privateCall: true, repeater: true, filter: 'PROM', ...overrides };
}

test("DMR24-bit destination, CC, slot, call type and operation match independent byte layout", () => {
    const model = createDefaultModel(); model.channels[0] = dmrChannel();
    const payload = encodePayload(model);
    assert.deepEqual(payload.slice(0, 32), fromHex('a034af08a034af085634127f5509444d52204d41580000000000000000000500'));
    assert.deepEqual(decodePayload(payload), model);
    assert.deepEqual(importFile(exportFile(model)).model, model);
    assert.throws(() => decodePayload(payload, 1), /flags/);
    for (const destinationId of [1, 65536, 0xffffff]) for (const colorCode of [0, 15])
        for (const timeslot of [1, 2]) for (const filter of FILTERS) {
            model.vfos[1] = dmrChannel({ destinationId, colorCode, timeslot, filter, privateCall: false, repeater: false });
            assert.deepEqual(decodePayload(encodePayload(model)), model);
        }
});

test("DMR invalid domain, conflicting modes and unused bytes fail closed", () => {
    const model = createDefaultModel();model.channels[0] = dmrChannel();
    for (const [field, value] of [['destinationId', 0], ['destinationId', 0x1000000], ['colorCode', 16],
        ['timeslot', 0], ['timeslot', 3], ['privateCall', 1], ['repeater', 'yes'], ['nac', 0x293], ['filter', 'any']]) {
        const invalid = structuredClone(model); invalid.channels[0][field] = value;
        assert.throws(() => encodePayload(invalid), undefined, field);
    }
    for (const [offset, value] of [[11, 128], [12, 0x43], [12, 0x61], [12, 0x4d], [26, 1], [30, 0], [31, 1]]) {
        const payload = encodePayload(model); payload[offset] = value;
        assert.throws(() => decodePayload(payload));
    }
});

test("deliberate mode conversion retains common channel fields and resets incompatible settings", () => {
    const channel = structuredClone(decodePayload(wireFixture()).channels[0]);
    const common = ({ name, rxHz, txHz, rxOnly, scanLists }) => ({ name, rxHz, txHz, rxOnly, scanLists });
    const before = common(channel);setChannelMode(channel, 'DMR');assert.deepEqual(common(channel), before);
    assert.equal(channel.destinationId, 1);assert.equal(channel.colorCode, 1);assert.equal(channel.timeslot, 1);
    assert.equal(channel.repeater, false);assert.equal(channel.privateCall, false);assert.equal(channel.nac, undefined);
    setChannelMode(channel, 'P25');assert.deepEqual(common(channel), before);
    assert.equal(channel.nac, 0x293);assert.equal(channel.talkgroup, 1);assert.equal(channel.destinationId, undefined);
});

test("dense varied databases keep exact payload bytes through file and model round trips", () => {
    let state = 0x9e3779b9;
    const next = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return state >>> 0; };
    for (let pass = 0; pass < 64; pass++) {
        const model = createDefaultModel();
        for (let index = 0; index < 32; index++) {
            if (next() % 4 === 0) continue;
            const channel = clone(model.vfos[0]);
            channel.name = `CH${index + 1}`;
            channel.mode = ["P25", "NFM", "FM"][next() % 3];
            channel.rxHz = 400000000 + next() % 80000001;
            channel.txHz = 136000000 + next() % 38000001;
            channel.nac = next() & 0xfff;
            channel.talkgroup = 1 + next() % 65535;
            channel.filter = FILTERS[next() % 3];
            channel.rxOnly = Boolean(next() & 1);
            channel.squelch = next() % 10;
            channel.scanLists = [0, 1, 2, 3].filter(() => next() & 1);
            if (channel.mode !== "P25") {
                channel.txTone = { type: "ctcss", value: 600 + next() % 2001 };
                channel.rxTone = { type: next() & 1 ? "dcs" : "dcs-inv", value: 1 + next() % 511 };
            }
            model.channels[index] = channel;
        }
        model.settings.sourceId = 1 + next() % 0xffffff;
        model.settings.screenSeconds = next() % 601;
        model.settings.keypadSeconds = next() % 601;
        const payload = encodePayload(model);
        assert.deepEqual(encodePayload(decodePayload(payload)), payload);
        assert.deepEqual(encodePayload(importFile(exportFile(model)).model), payload);
    }
});
