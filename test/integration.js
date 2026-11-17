import { tests } from "@iobroker/testing";
import { expect } from "chai";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function wrapSoap(innerXml) {
  return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>${innerXml}</s:Body>
</s:Envelope>`;
}

function createMockSoapServer() {
  const requests = [];
  let rejectAuth = false;

  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      const soapAction = String(req.headers.soapaction ?? "").split("#")[1] ?? "";
      requests.push({ action: soapAction, body });

      if (rejectAuth) {
        res.writeHead(401, { "Content-Type": "text/plain" });
        res.end("Unauthorized");
        return;
      }

      let responseXml = "";
      if (soapAction === "getState") {
        if (body.includes("<u:bootId />")) {
          responseXml =
            "<getStateResponse><bootId>boot-1</bootId><stateId>state-1</stateId></getStateResponse>";
        } else if (body.includes("masterWeatherModule")) {
          responseXml = `<getStateResponse><moduleList>
            <module class="masterWeatherModule" index="0" state="ready">
              <temperatureAir unit="°C" value="18.5" />
              <precipitation unit="" value="no" />
            </module>
          </moduleList></getStateResponse>`;
        } else if (body.includes("masterRoomClimateModule")) {
          responseXml = `<getStateResponse><moduleList>
            <module class="masterRoomClimateModule" index="4" state="ready">
              <thermostat>
                <operatingState>heating</operatingState>
                <valveState>open</valveState>
                <actualTemperatureMean unit="°C" value="21.0" />
                <setTemperatureHeating unit="°C" value="21.5" />
              </thermostat>
            </module>
          </moduleList></getStateResponse>`;
        } else {
          responseXml = `<getStateResponse><moduleList>
            <module class="masterInModule" index="1" state="ready">
              <channel index="0" ledState="off" />
            </module>
            <module class="masterDimModule" index="3" state="ready">
              <channel index="0" outState="50" />
            </module>
          </moduleList></getStateResponse>`;
        }
      } else if (soapAction === "getIdentity") {
        responseXml = `<getIdentityResponse><moduleList>
          <module class="masterInModule" index="1" name="Hall" description="">
            <channel index="0" name="Light" description="" />
          </module>
          <module class="masterDimModule" index="3" name="Dimmer" description="">
            <channel index="0" name="Ceiling" description="" />
          </module>
          <module class="masterRoomClimateModule" index="4" name="Living" description="" />
        </moduleList></getIdentityResponse>`;
      } else if (soapAction === "getDeviceStateList") {
        responseXml = `<getDeviceStateResponse>
          <baseVoltageMain unit="V">24.1</baseVoltageMain>
          <baseSupplyStateCAN1>ok</baseSupplyStateCAN1>
        </getDeviceStateResponse>`;
      } else if (soapAction === "setState") {
        responseXml = `<setStateResponse><moduleList>
          <module class="masterRoomClimateModule" index="4">
            <thermostat><setTemperatureHeating value="22" /></thermostat>
          </module>
        </moduleList></setStateResponse>`;
      }

      res.writeHead(200, { "Content-Type": "text/xml; charset=utf-8" });
      res.end(wrapSoap(responseXml));
    });
  });

  return {
    requests,
    setRejectAuth(value) {
      rejectAuth = value;
    },
    async start() {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      return server.address().port;
    },
    async stop() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

async function waitForState(harness, id, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await harness.states.getStateAsync(id);
    if (state && state.val !== null && state.val !== undefined) return state;
    await new Promise((r) => setTimeout(r, 50));
  }
  return harness.states.getStateAsync(id);
}

tests.integration(join(__dirname, ".."), {
  defineAdditionalTests({ suite }) {
    suite("Innoxel SOAP integration", (getHarness) => {
      let mockServer;
      let port;

      before(async () => {
        mockServer = createMockSoapServer();
        port = await mockServer.start();
      });

      after(async () => {
        await mockServer.stop();
      });

      it("connects, creates states, and forwards state changes & messages", async function () {
        this.timeout(60000);
        const harness = getHarness();
        await harness.changeAdapterConfig("innoxel", {
          native: {
            ipaddress: "127.0.0.1",
            port,
            username: "admin",
            password: "secret",
            changeInterval: 60,
            roomTemperatureInterval: 60,
            weatherInterval: 60,
            deviceStatusInterval: 60,
          },
        });

        await harness.startAdapterAndWait(true);

        const dimState = await waitForState(
          harness,
          "innoxel.0.moduleDim.003.0.outState",
        );
        expect(dimState?.val).to.equal(50);

        const weatherTemp = await waitForState(
          harness,
          "innoxel.0.weather.temperatureAir",
        );
        expect(weatherTemp?.val).to.equal(18.5);

        const valveOpen = await waitForState(
          harness,
          "innoxel.0.roomClimate.4.valveOpen",
        );
        expect(valveOpen?.val).to.equal(true);

        const voltage = await waitForState(
          harness,
          "innoxel.0.deviceStatus.baseVoltageMain",
        );
        expect(voltage?.val).to.equal(24.1);

        await harness.states.setStateAsync(
          "innoxel.0.moduleDim.003.0.outState",
          { val: 80, ack: false },
        );
        await new Promise((r) => setTimeout(r, 200));

        expect(
          mockServer.requests.some(
            (r) => r.action === "setState" && r.body.includes('dimValue="80"'),
          ),
        ).to.equal(true);

        harness.sendTo("innoxel.0", "triggerInModule", "1:0", () => {});
        await new Promise((r) => setTimeout(r, 200));
        expect(
          mockServer.requests.some(
            (r) =>
              r.action === "setState" &&
              r.body.includes('perform="autoImpulse"'),
          ),
        ).to.equal(true);
      });
    });

    suite("Innoxel SOAP auth error", (getHarness) => {
      let mockServer;
      let port;

      before(async () => {
        mockServer = createMockSoapServer();
        mockServer.setRejectAuth(true);
        port = await mockServer.start();
      });

      after(async () => {
        await mockServer.stop();
      });

      it("sets info.connection=false and terminates on 401 auth error", async function () {
        this.timeout(60000);
        const harness = getHarness();
        await harness.changeAdapterConfig("innoxel", {
          native: {
            ipaddress: "127.0.0.1",
            port,
            username: "admin",
            password: "wrong",
          },
        });

        await harness.startAdapter();
        await new Promise((r) => setTimeout(r, 1000));

        const conn = await harness.states.getStateAsync(
          "innoxel.0.info.connection",
        );
        expect(conn?.val).to.equal(false);
      });
    });
  },
});
