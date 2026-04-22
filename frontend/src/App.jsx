import { CssBaseline, ThemeProvider, createTheme, Box, Typography } from "@mui/material";

const theme = createTheme({
  palette: {
    background: { default: "#DFDFDF" },
    primary: { main: "#4B382E" },
    secondary: { main: "#C0A300" },
  },
});

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Typography variant="h4" color="primary">
          Poolantir Simulation
        </Typography>
      </Box>
    </ThemeProvider>
  );
}
