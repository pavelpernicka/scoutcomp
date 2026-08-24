"""Stable translation metadata for declarative module catalogue values."""


def route_translation_id(route: str) -> str:
    return (route.strip("/") or "home").replace("/", "_").replace("-", "_")


def localized_menu_item(module_code: str, item: dict, group: str) -> dict:
    return {
        **item,
        "label_key": f"modules.{module_code}.{group}.{route_translation_id(item.get('route', ''))}.label",
    }


def localized_widget(module_code: str, item: dict) -> dict:
    widget_id = item.get("id") or f"{module_code}.{item['component']}"
    key = widget_id.removeprefix(f"{module_code}.").replace(".", "_")
    return {
        **item,
        "title_key": f"modules.{module_code}.widgets.{key}.title",
        "text_key": f"modules.{module_code}.widgets.{key}.text",
    }


def module_translation_keys(module_code: str) -> dict:
    return {
        "name_key": f"modules.{module_code}.name",
        "description_key": f"modules.{module_code}.description",
    }
