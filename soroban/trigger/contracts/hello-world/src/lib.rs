#![no_std]

extern crate alloc;

use wee_alloc::WeeAlloc;
#[global_allocator]
static ALLOC: WeeAlloc = WeeAlloc::INIT;

use soroban_sdk::{contract, contractimpl, contracttype, Env, String, Symbol, Map, symbol_short};

#[contract]
pub struct Contract;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Trigger {
    trigger_type: String,
    phase: String,
    title: String,
    source: String,
    river_basin: String,
    min_lead_time_delay: u32,
    max_lead_time_delay: u32,
    forecast_probability: u32,
    is_mandatory: bool,
    is_triggered: bool,
}

// Define event types with full Trigger struct
#[contracttype]
pub enum TriggerEvent {
    Added(Symbol, Trigger),    // Emitted when a trigger is added, with ID and full Trigger
    Triggered(Symbol, Trigger), // Emitted when a trigger is marked as triggered, with ID and updated Trigger
}

#[contractimpl]
impl Contract {
    pub fn add_trigger(
        env: Env,
        id: Symbol,
        trigger_type: String,
        phase: String,
        title: String,
        source: String,
        river_basin: String,
        min_lead_time_delay: u32,
        max_lead_time_delay: u32,
        forecast_probability: u32,
        is_mandatory: bool,
    ) {
        let trigger_key = symbol_short!("triggers");

        let mut triggers: Map<Symbol, Trigger> = env
            .storage()
            .persistent()
            .get(&trigger_key)
            .unwrap_or(Map::new(&env));

        let trigger = Trigger {
            trigger_type,
            phase,
            title,
            source,
            river_basin,
            min_lead_time_delay,
            max_lead_time_delay,
            forecast_probability,
            is_mandatory,
            is_triggered: false,
        };

        triggers.set(id.clone(), trigger.clone()); // Clone trigger for storage
        env.storage().persistent().set(&trigger_key, &triggers);

        // Emit event with full Trigger
        env.events().publish(("TriggerEvent", "Added"), TriggerEvent::Added(id, trigger));
    }

    pub fn get_trigger(env: Env, id: Symbol) -> Option<Trigger> {
        let trigger_key = symbol_short!("triggers");
        let triggers: Map<Symbol, Trigger> = env
            .storage()
            .persistent()
            .get(&trigger_key)
            .unwrap_or(Map::new(&env));

        triggers.get(id)
    }

    pub fn update_trigger_to_triggered(env: Env, id: Symbol) {
        let trigger_key = symbol_short!("triggers");
        let mut triggers: Map<Symbol, Trigger> = env
            .storage()
            .persistent()
            .get(&trigger_key)
            .unwrap_or(Map::new(&env));

        if let Some(mut trigger) = triggers.get(id.clone()) {
            trigger.is_triggered = true;
            triggers.set(id.clone(), trigger.clone()); // Clone updated trigger for storage
            env.storage().persistent().set(&trigger_key, &triggers);

            // Emit event with full updated Trigger
            env.events().publish(("TriggerEvent", "Triggered"), TriggerEvent::Triggered(id, trigger));
        }
    }
}