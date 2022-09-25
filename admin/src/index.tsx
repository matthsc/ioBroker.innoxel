import React from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider, StyledEngineProvider } from "@mui/material/styles";
import theme from "@iobroker/adapter-react-v5/Theme";
import Utils from "@iobroker/adapter-react-v5/Components/Utils";
import App from "./app";

let themeName = Utils.getThemeName();

function build(): void {
    const root = createRoot(document.getElementById("root") as HTMLElement);
    root.render(
        <StyledEngineProvider injectFirst>
            <ThemeProvider theme={theme(themeName)}>
                <App
                    adapterName="innoxel"
                    onThemeChange={(_theme) => {
                        themeName = _theme;
                        build();
                    }}
                />
            </ThemeProvider>
        </StyledEngineProvider>,
    );
}

build();
