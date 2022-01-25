import React from "react";
import { withStyles } from "@material-ui/core/styles";
import { CreateCSSProperties } from "@material-ui/core/styles/withStyles";
import {
    Box,
    Checkbox,
    FormControl,
    FormControlLabel,
    FormHelperText,
    Grid,
    Input,
    MenuItem,
    Select,
    TextField,
} from "@material-ui/core";
import I18n from "@iobroker/adapter-react/i18n";

const styles = (): Record<string, CreateCSSProperties> => ({
    input: {
        marginTop: 0,
        minWidth: 400,
    },
    button: {
        marginRight: 20,
    },
    card: {
        maxWidth: 345,
        textAlign: "center",
    },
    media: {
        height: 180,
    },
    column: {
        display: "inline-block",
        verticalAlign: "top",
        marginRight: 20,
    },
    columnLogo: {
        width: 350,
        marginRight: 0,
    },
    columnSettings: {
        width: "calc(100% - 370px)",
    },
    controlElement: {
        //background: "#d2d2d2",
        marginBottom: 5,
    },
});

interface SettingsProps {
    classes: Record<string, string>;
    native: Record<string, any>;

    onChange: (attr: string, value: any) => void;
}

interface SettingsState {
    // add your state properties here
    dummy?: undefined;
}

class Settings extends React.Component<SettingsProps, SettingsState> {
    constructor(props: SettingsProps) {
        super(props);
        this.state = {};
    }

    renderInput(title: AdminWord, attr: string, helperText?: AdminWord, type?: string) {
        return (
            <Grid item xs>
                <TextField
                    label={I18n.t(title)}
                    className={`${this.props.classes.input} ${this.props.classes.controlElement}`}
                    value={this.props.native[attr]}
                    type={type || "text"}
                    onChange={(e) => this.props.onChange(attr, e.target.value)}
                    margin="normal"
                    helperText={helperText ? I18n.t(helperText) : undefined}
                />
            </Grid>
        );
    }

    renderSelect(
        title: AdminWord,
        attr: string,
        options: { value: string; title: AdminWord }[],
        style?: React.CSSProperties,
    ) {
        return (
            <Grid item xs>
                <FormControl
                    className={`${this.props.classes.input} ${this.props.classes.controlElement}`}
                    style={{
                        paddingTop: 5,
                        ...style,
                    }}
                >
                    <Select
                        value={this.props.native[attr] || "_"}
                        onChange={(e) => this.props.onChange(attr, e.target.value === "_" ? "" : e.target.value)}
                        input={<Input name={attr} id={attr + "-helper"} />}
                    >
                        {options.map((item) => (
                            <MenuItem key={"key-" + item.value} value={item.value || "_"}>
                                {I18n.t(item.title)}
                            </MenuItem>
                        ))}
                    </Select>
                    <FormHelperText>{I18n.t(title)}</FormHelperText>
                </FormControl>
            </Grid>
        );
    }

    renderCheckbox(title: AdminWord, attr: string, style?: React.CSSProperties) {
        return (
            <Grid item>
                <FormControlLabel
                    key={attr}
                    style={{
                        paddingTop: 5,
                        ...style,
                    }}
                    className={this.props.classes.controlElement}
                    control={
                        <Checkbox
                            checked={this.props.native[attr]}
                            onChange={() => this.props.onChange(attr, !this.props.native[attr])}
                            color="primary"
                        />
                    }
                    label={I18n.t(title)}
                />
            </Grid>
        );
    }

    renderHeader(title: AdminWord, description?: AdminWord) {
        return (
            <Grid item xs={12}>
                <h1>{I18n.t(title)}</h1>
                {description && I18n.t(description)}
            </Grid>
        );
    }

    render() {
        return (
            <form className={this.props.classes.tab}>
                <Box p={2}>
                    <Grid container spacing={2}>
                        {this.renderHeader("connection")}
                        {this.renderInput("ip", "ipaddress", "ip_description")}
                        {this.renderInput("port", "port", "port_description", "number")}
                        {this.renderInput("username", "username", "username_description")}
                        {this.renderInput("password", "password", "password_description", "password")}
                        {this.renderHeader("intervals", "intervals_details")}
                        {this.renderInput("intervalChange", "changeInterval", "intervalChange_description", "number")}
                        {this.renderInput("intervalRoomTemperature", "roomTemperatureInterval", undefined, "number")}
                        {this.renderInput("intervalWeather", "weatherInterval", undefined, "number")}
                        {this.renderInput(
                            "intervalDeviceStatus",
                            "deviceStatusInterval",
                            "intervalDeviceStatus_description",
                            "number",
                        )}
                    </Grid>
                </Box>
            </form>
        );
    }
}

export default withStyles(styles)(Settings);
