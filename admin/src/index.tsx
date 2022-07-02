import React from "react";
import { createRoot } from "react-dom/client";
import { MuiThemeProvider } from "@material-ui/core/styles";
import theme from "@iobroker/adapter-react/Theme";
import Utils from "@iobroker/adapter-react/Components/Utils";
import App from "./app";

let themeName = Utils.getThemeName();

function build(): void {
    const root = createRoot(document.getElementById("root") as HTMLElement);
    root.render(
        <MuiThemeProvider theme={theme(themeName)}>
            <App
                adapterName="innoxel"
                onThemeChange={(_theme) => {
                    themeName = _theme;
                    build();
                }}
            />
        </MuiThemeProvider>,
    );
}

build();
