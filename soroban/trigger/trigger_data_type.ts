type TriggerType = {
  type: "manual" | "automatic";
  phase: "readiness" | "activation";
  title: string;
  soucrce: "glofas" | "gov";
  river_basin: string;
  minimum_lead_time_delay: number;
  maximum_lead_time_delay: number;
  forecast_probability: number;
  is_mandatory: boolean;
  is_triggered: boolean;
};
